import { describe, expect, it } from 'vitest';
import { chosenCall } from '../../src/server/handlers/call-choice';

const FIRST = { callId: crypto.randomUUID() };
const SECOND = { callId: crypto.randomUUID() };

describe('the call a tool means', () => {
  it('is the only running call when none is named', () => {
    expect(chosenCall([FIRST])).toBe(FIRST.callId);
  });

  it('is the named call when it is one of the running calls', () => {
    expect(chosenCall([FIRST, SECOND], SECOND.callId)).toBe(SECOND.callId);
  });

  it('asks for the call id when several are running and none is named', () => {
    expect(() => chosenCall([FIRST, SECOND])).toThrow('pass callId');
  });

  it('refuses when no call is running or the named call is not running', () => {
    expect(() => chosenCall([])).toThrow('no call of yours');
    expect(() => chosenCall([FIRST], SECOND.callId)).toThrow(`no call ${SECOND.callId}`);
  });
});
