import { describe, expect, it } from 'vitest';
import { upstreamBody } from '../../src/harness/transport';

function request(messages: readonly string[]): Parameters<typeof upstreamBody>[0] {
  return { model: 'm', stream: true, messages: [...messages] };
}

describe('the OpenRouter request body', () => {
  it('carries the conversation as session_id so provider routing stays sticky', () => {
    const first = upstreamBody(request(['a']), 's-1');
    const later = upstreamBody(request(['a', 'b']), 's-1');
    expect(first).toMatchObject({ session_id: 's-1', usage: { include: true } });
    expect(later).toMatchObject({ session_id: 's-1' });
  });

  it('routes around providers that drop string arguments from tool calls', () => {
    expect(upstreamBody(request(['a']), 's-1')).toMatchObject({
      provider: { ignore: ['wafer'] },
    });
  });
});
