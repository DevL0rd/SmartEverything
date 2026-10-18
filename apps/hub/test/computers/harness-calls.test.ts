import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, DSH_SESSION_ID } from '@smarteverything/domain';
import type { HubHarnessControl } from '@smarteverything/domain';
import { HarnessCalls } from '../../src/node/harness-connection';

const OPEN = 1;

const FRAME = z.record(z.string(), z.unknown());

class FakeSocket {
  readonly OPEN = OPEN;
  readyState = OPEN;
  readonly sent: Record<string, unknown>[] = [];
  send(text: string): void {
    this.sent.push(FRAME.parse(JSON.parse(text)));
  }
}

const BINDING = {
  device_id: randomUUID(),
  generation: randomUUID(),
  runtime_instance: randomUUID(),
};
const STAT = { operation: 'stat', session_id: DSH_SESSION_ID.parse(randomUUID()) } as const;

async function sent(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function linked(): { readonly calls: HarnessCalls; readonly socket: FakeSocket } {
  const calls = new HarnessCalls();
  const socket = new FakeSocket();
  calls.attach({ socket: socket, binding: BINDING });
  return { calls, socket };
}

function answer(
  id: unknown,
  result: Extract<HubHarnessControl, { type: 'harness_call_result' }>['result'],
): Extract<HubHarnessControl, { type: 'harness_call_result' }> {
  return { ...BINDING, type: 'harness_call_result', id: String(id), result };
}

describe('the calls a computer harness makes to the hub over its socket', () => {
  it('sends a bound call frame and resolves with the answer', async () => {
    const { calls, socket } = linked();
    const pending = calls.call(STAT);
    await sent();
    const [frame] = socket.sent;
    expect(frame).toMatchObject({ ...BINDING, type: 'harness_call', request: STAT });
    calls.receive(answer(frame?.['id'], { ok: true, value: { next_seq: 3 } }));
    await expect(pending).resolves.toEqual({ next_seq: 3 });
  });

  it('raises a failed call with the code and message the hub gave', async () => {
    const { calls, socket } = linked();
    const pending = calls.call(STAT);
    await sent();
    calls.receive(
      answer(socket.sent[0]?.['id'], {
        ok: false,
        error: { code: 'ownership_lost', message: 'Another writer owns this session.' },
      }),
    );
    await expect(pending).rejects.toSatisfy(
      (cause: unknown) => cause instanceof ApiError && cause.code === 'ownership_lost',
    );
  });

  it('keeps concurrent calls apart by id', async () => {
    const { calls, socket } = linked();
    const first = calls.call(STAT);
    const second = calls.call(STAT);
    await sent();
    const [one, two] = socket.sent;
    calls.receive(answer(two?.['id'], { ok: true, value: 'second' }));
    calls.receive(answer(one?.['id'], { ok: true, value: 'first' }));
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
  });

  it('tells the hub to stop a call the harness abandons', async () => {
    const { calls, socket } = linked();
    const abort = new AbortController();
    const pending = calls.call(STAT, abort.signal);
    await sent();
    const id = socket.sent[0]?.['id'];
    abort.abort(new Error('interrupted'));
    await expect(pending).rejects.toThrow('interrupted');
    expect(socket.sent[1]).toMatchObject({ type: 'harness_call_cancel', id });
  });

  it('fails a call that was in flight when its socket dropped', async () => {
    const { calls, socket } = linked();
    const pending = calls.call(STAT);
    await sent();
    calls.detach(socket);
    await expect(pending).rejects.toSatisfy(
      (cause: unknown) => cause instanceof ApiError && cause.code === 'upstream_failed',
    );
  });

  it('holds a call made while reconnecting and sends it on the next socket', async () => {
    const calls = new HarnessCalls();
    const pending = calls.call(STAT);
    const socket = new FakeSocket();
    calls.attach({ socket: socket, binding: BINDING });
    await sent();
    expect(socket.sent).toHaveLength(1);
    calls.receive(answer(socket.sent[0]?.['id'], { ok: true, value: 'late' }));
    await expect(pending).resolves.toBe('late');
  });
});
