import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import type { LogRecord } from '@smarteverything/logging';
import { Logger } from '@smarteverything/logging';
import { bootRuntime } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;

afterEach(async () => {
  await fixture?.dispose().catch(() => undefined);
  fixture = undefined;
});

const CLOSE_GRACE_MS = 250;

interface HeldBarrier {
  readonly reached: Promise<void>;
  readonly disposed: Promise<void>;
  readonly release: () => void;
  arm(): void;
}

function holdNextFlush(ctx: Context): HeldBarrier {
  let armed = false;
  let release = (): void => undefined;
  let reach = (): void => undefined;
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const disposed = new Promise<void>((resolve) => {
    ctx.on('session/disposed', (): void => {
      resolve();
    });
  });
  const original = ctx.sessions.flush.bind(ctx.sessions);
  vi.spyOn(ctx.sessions, 'flush').mockImplementation(async (session) => {
    if (armed) {
      armed = false;
      reach();
      await gate;
    }
    return original(session);
  });
  return {
    reached,
    disposed,
    release,
    arm: (): void => {
      armed = true;
    },
  };
}

function barrierFailures(records: readonly LogRecord[]): readonly LogRecord[] {
  return records.filter(
    (record) => record.failure?.message.includes('no longer registered') === true,
  );
}

describe('an interrupt racing a session close', () => {
  it('finishes its durability barrier before the session is disposed', async () => {
    const records: LogRecord[] = [];
    const sink = Logger.sink;
    let held: HeldBarrier | undefined;
    let interrupting = false;
    Logger.configure({
      sink: (record): void => {
        records.push(record);
        if (interrupting && record.event === 'session.stop_finished') {
          interrupting = false;
          held?.arm();
        }
      },
    });
    try {
      fixture = await bootRuntime({
        mount: (ctx): void => {
          void ctx.inject(['sessions'], (active: Context): void => {
            held = holdNextFlush(active);
          });
        },
      });
      const host = fixture;
      host.model.script({ kind: 'hang' });
      const options = host.sessionOptions();
      const session = await host.runtime.create(options);
      const barrier = held;
      if (barrier === undefined) throw new Error('The flush barrier was not installed.');
      session.text('start something long');
      await vi.waitFor(() => {
        expect(host.model.requests).toHaveLength(1);
      });

      interrupting = true;
      const interrupted = session.interrupt();
      await barrier.reached;
      const closing = host.runtime.close(options.sessionId);
      await Promise.race([
        barrier.disposed,
        new Promise((resolve) => setTimeout(resolve, CLOSE_GRACE_MS)),
      ]);
      barrier.release();

      await expect(interrupted).resolves.toBeUndefined();
      await expect(closing).resolves.toBeUndefined();
      expect(barrierFailures(records)).toStrictEqual([]);
    } finally {
      Logger.configure({ sink });
    }
  });
});
