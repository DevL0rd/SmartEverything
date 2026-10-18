import { describe, expect, it } from 'vitest';
import { HARNESS_NATIVE_FRAME, HARNESS_PUBLICATION } from '../src';

const BOUND = { session_id: 'session-1', epoch: 2 };

describe('a native frame from a machine', () => {
  it.each([
    { kind: 'open' },
    { kind: 'close' },
    { kind: 'input', message_id: 'm1', turn: 1 },
    { kind: 'discarded', message_id: 'm1' },
    { kind: 'text', delta: 'hi' },
    { kind: 'reasoning', delta: 'hm' },
    { kind: 'attempt', id: 'a:1', state: 'committed' },
    { kind: 'usage', usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3 } },
    { kind: 'status', status: 'idle', work: [] },
    { kind: 'commands', revision: 'a'.repeat(64) },
    { kind: 'context', estimate: null },
    { kind: 'error', message: 'boom' },
    { kind: 'interactions', interactions: [], added: null },
    {
      kind: 'workspace',
      storage_binding: { kind: 'managed', chat_id: '8d1f4c4e-9a0e-4c8e-8f3e-0b7b0f0c7a11' },
    },
    {
      kind: 'permission',
      operation_id: '8d1f4c4e-9a0e-4c8e-8f3e-0b7b0f0c7a11',
      permission: { sandbox: 'read-only', approval: 'on-request' },
    },
  ])('is accepted as a $kind frame', (frame) => {
    expect(HARNESS_NATIVE_FRAME.parse({ ...BOUND, ...frame })).toMatchObject(frame);
  });

  it('keeps the usage the model reported and drops what it did not ask for', () => {
    const frame = HARNESS_NATIVE_FRAME.parse({
      ...BOUND,
      kind: 'usage',
      usage: { inputTokens: 1, outputTokens: 2, supplier: { cost: 3 } },
    });

    expect(frame).toMatchObject({ usage: { inputTokens: 1, outputTokens: 2 } });
    expect(JSON.stringify(frame)).not.toContain('supplier');
  });

  it.each([
    ['an unknown kind', { kind: 'snapshot' }],
    ['a frame without its epoch', { kind: 'open', epoch: undefined }],
    ['a frame with a field it does not define', { kind: 'text', delta: 'x', extra: true }],
    ['a frame that carries a log event', { kind: 'session', event: { type: 'a', seq: 1 } }],
    ['an unknown status', { kind: 'status', status: 'asleep', work: [] }],
  ])('is refused as %s', (_name, frame) => {
    expect(() => HARNESS_NATIVE_FRAME.parse({ ...BOUND, ...frame })).toThrow();
  });

  it('travels in a publication that names the runtime it came from', () => {
    const identity = {
      device_id: '8d1f4c4e-9a0e-4c8e-8f3e-0b7b0f0c7a11',
      generation: '8d1f4c4e-9a0e-4c8e-8f3e-0b7b0f0c7a12',
      runtime_instance: '8d1f4c4e-9a0e-4c8e-8f3e-0b7b0f0c7a13',
    };

    expect(
      HARNESS_PUBLICATION.parse({
        ...identity,
        type: 'harness_native',
        frame: { ...BOUND, kind: 'open' },
      }),
    ).toMatchObject({ type: 'harness_native', frame: { kind: 'open' } });
    expect(() =>
      HARNESS_PUBLICATION.parse({
        ...identity,
        type: 'harness_event',
        event: { ...BOUND, kind: 'text' },
      }),
    ).toThrow();
  });
});
