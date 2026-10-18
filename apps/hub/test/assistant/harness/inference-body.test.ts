import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { INFERENCE } from '../../../src/harness/transport';

function body(messages: number, tools: number, request: Record<string, unknown> = {}): unknown {
  return {
    device_id: randomUUID(),
    generation: randomUUID(),
    runtime_instance: randomUUID(),
    claim: {
      session_id: randomUUID(),
      target: { kind: 'server' },
      runtime_instance: randomUUID(),
      connection_generation: randomUUID(),
      epoch: 1,
    },
    route_id: randomUUID(),
    request: {
      model: 'm'.repeat(500),
      stream: true,
      messages: Array.from({ length: messages }, (_, index) => ({ role: 'user', content: index })),
      tools: Array.from({ length: tools }, (_, index) => ({ type: 'function', index })),
      max_tokens: 5_000_000,
      reasoning_effort: 'e'.repeat(100),
      prompt_cache_key: 'k'.repeat(1000),
      ...request,
    },
  };
}

describe('inference body', () => {
  it('admits a conversation with more than 10,000 messages and 2,000 tools', () => {
    const parsed = INFERENCE.parse(body(10_001, 2001));
    expect(parsed.request.messages).toHaveLength(10_001);
    expect(parsed.request.tools).toHaveLength(2001);
  });

  it('still refuses an empty model and a non-streaming request', () => {
    expect(() => INFERENCE.parse(body(1, 0, { model: '' }))).toThrow();
    expect(() => INFERENCE.parse(body(1, 0, { stream: false }))).toThrow();
  });
});
