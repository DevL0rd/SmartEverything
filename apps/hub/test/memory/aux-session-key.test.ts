import { describe, expect, it } from 'vitest';
import { withSessionKey } from '../../src/assistant/aux-accounting';

function bodyOf(init: RequestInit | undefined): string {
  return typeof init?.body === 'string' ? init.body : '';
}

describe('the session key of an auxiliary request', () => {
  it('replaces the session id in the JSON body and leaves other requests alone', () => {
    const init = { method: 'POST', body: JSON.stringify({ model: 'm', session_id: 'chat-1' }) };

    expect(JSON.parse(bodyOf(withSessionKey(init, 'memory-manager')))).toStrictEqual({
      model: 'm',
      session_id: 'memory-manager',
    });
    expect(withSessionKey(init, undefined)).toBe(init);
    expect(withSessionKey(undefined, 'memory-manager')).toBeUndefined();
  });
});
