import { describe, expect, it } from 'vitest';
import type { SessionPhase } from './player-state';
import { talkIntentOf, type TalkWish } from './talk-wish';

function wish(phase: SessionPhase, change: Partial<TalkWish> = {}): TalkWish {
  return {
    wantedFor: 'cam',
    deviceId: 'cam',
    twoWayAudio: true,
    transport: 'webrtc',
    phase,
    ...change,
  };
}

describe('two-way talk intent', () => {
  it('stays on when the session reports connected again with a new phase object', () => {
    const first = talkIntentOf(wish({ kind: 'connected' }));
    const second = talkIntentOf(wish({ kind: 'connected' }));
    expect(first).toStrictEqual({ talk: true, active: true, over: false });
    expect(second).toStrictEqual(first);
  });

  it('pauses the microphone while the session is interrupted and resumes when it reconnects', () => {
    expect(talkIntentOf(wish({ kind: 'interrupted' }))).toStrictEqual({
      talk: true,
      active: false,
      over: false,
    });
    expect(talkIntentOf(wish({ kind: 'connected' })).active).toBe(true);
  });

  it('is over when the session fails or goes idle', () => {
    expect(talkIntentOf(wish({ kind: 'failed', error: { kind: 'noPath' } })).over).toBe(true);
    expect(talkIntentOf(wish({ kind: 'idle' })).over).toBe(true);
  });

  it('is off for another camera, a camera without two-way audio and the relay', () => {
    const connected = { kind: 'connected' } as const;
    expect(talkIntentOf(wish(connected, { wantedFor: 'other' })).talk).toBe(false);
    expect(talkIntentOf(wish(connected, { wantedFor: null })).talk).toBe(false);
    expect(talkIntentOf(wish(connected, { twoWayAudio: false })).talk).toBe(false);
    expect(talkIntentOf(wish(connected, { transport: 'mse' })).talk).toBe(false);
  });
});
