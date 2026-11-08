import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import type { LogRecord } from '@smarteverything/logging';
import { Logger } from '@smarteverything/logging';
import type { HarnessNativeFrame } from '@smarteverything/domain';
import { bootDispatcher } from './support/dispatcher';
import type { DispatcherFixture } from './support/dispatcher';
import { route, runningChild } from './support/native-helper';

let fixture: DispatcherFixture | undefined;

afterEach(async () => {
  await fixture?.dispose().catch(() => undefined);
  fixture = undefined;
});

const HANDLE_CLOSE_GRACE_MS = 250;

function failedPublications(records: readonly LogRecord[]): readonly LogRecord[] {
  return records.filter(
    (record) =>
      record.event === 'publication.failed' ||
      record.failure?.message.includes('handle that is closed') === true,
  );
}

function steps(order: readonly string[], step: 'publish' | 'frame'): readonly string[] {
  const prefix = `${step}:`;
  return order.flatMap((entry) => (entry.startsWith(prefix) ? [entry.slice(prefix.length)] : []));
}

function paused(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('a machine shutting down while a turn runs', () => {
  it('delivers every frame an interrupted turn queued before it closes the session', async () => {
    const order: string[] = [];
    const records: LogRecord[] = [];
    const disposed = new Set<string>();
    const sink = Logger.sink;
    let releaseGate = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let reachedGate = (): void => undefined;
    const gateReached = new Promise<void>((resolve) => {
      reachedGate = resolve;
    });
    let sessionDisposed = (): void => undefined;
    const sessionClosed = new Promise<void>((resolve) => {
      sessionDisposed = resolve;
    });
    let armed = false;
    let held: HarnessNativeFrame | undefined;

    Logger.configure({
      sink: (record): void => {
        records.push(record);
      },
    });
    try {
      fixture = await bootDispatcher(
        undefined,
        async (ctx: Context): Promise<void> => {
          ctx.on('session/disposed', (session): void => {
            order.push('session-disposed');
            disposed.add(String(session.id));
            sessionDisposed();
          });
        },
        {
          intercept: (frame): void => {
            order.push(`frame:${frame.kind}`);
          },
          beforePublish: async (frame): Promise<void> => {
            order.push(`publish:${frame.kind}`);
            if (disposed.has(frame.session_id))
              throw new Error(`The ${frame.kind} frame reached a session handle that is closed.`);
            if (!armed) return;
            armed = false;
            held = frame;
            reachedGate();
            await gate;
          },
        },
      );
      const opened = await fixture.open();
      fixture.model.script({ kind: 'hang' });
      await fixture.send(opened, 'work');
      await vi.waitFor(() => {
        expect(fixture?.model.requests).toHaveLength(1);
      });

      armed = true;
      const interrupting = fixture.control(opened, 'interrupt');
      await gateReached;
      const gateFrame = held;
      if (gateFrame === undefined) throw new Error('The gate held no frame.');
      const framesBefore = fixture.frames.length;
      order.push('dispose');
      const disposing = fixture.dispatcher.dispose();
      await Promise.race([sessionClosed, paused(HANDLE_CLOSE_GRACE_MS)]);
      releaseGate();
      await Promise.all([disposing, interrupting]);
      await paused(0);

      const attempted = steps(order, 'publish');
      const delivered = steps(order, 'frame');
      const heldIndex = fixture.frames.indexOf(gateFrame);
      const queued = fixture.frames.slice(heldIndex + 1).map((frame) => frame.kind);

      expect(failedPublications(records)).toStrictEqual([]);
      expect(delivered).toStrictEqual(attempted);
      expect(records.filter((record) => record.event === 'publication.sealed')).toHaveLength(1);
      expect(heldIndex).toBe(framesBefore);
      expect(queued.at(-1)).toBe('close');
      expect(queued.filter((kind) => kind === 'status')).toHaveLength(1);
      expect(order.indexOf('frame:close')).toBeGreaterThan(order.indexOf('dispose'));
      expect(order.indexOf('frame:close')).toBeLessThan(order.indexOf('session-disposed'));
      expect(order.at(-1)).toBe('session-disposed');
    } finally {
      Logger.configure({ sink });
    }
  });

  it('closes the native child it forwards when the machine disposes it', async () => {
    fixture = await bootDispatcher();
    const parent = await fixture.open();
    route(fixture, parent.sessionId, 'hang');
    await fixture.send(parent, 'delegate');
    const child = await runningChild(fixture, parent.sessionId);

    await fixture.dispatcher.dispose();

    const childFrames = fixture.frames
      .filter((frame) => frame.session_id === child.session_id)
      .map((frame) => frame.kind);
    expect(childFrames.at(-1)).toBe('close');
    expect(childFrames.filter((kind) => kind === 'close')).toHaveLength(1);
  });
});
