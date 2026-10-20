import { describe, expect, it } from 'vitest';
import type { SessionPhase } from './player-state';
import { talkIntentOf, talkOffered, type TalkWish } from './talk-wish';

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

  it('is off for another camera, a camera without two-way audio and a relay', () => {
    const connected = { kind: 'connected' } as const;
    expect(talkIntentOf(wish(connected, { wantedFor: 'other' })).talk).toBe(false);
    expect(talkIntentOf(wish(connected, { wantedFor: null })).talk).toBe(false);
    expect(talkIntentOf(wish(connected, { twoWayAudio: false })).talk).toBe(false);
    expect(talkIntentOf(wish(connected, { transport: 'mse' })).talk).toBe(false);
  });
});

describe('talk button', () => {
  const offer = {
    twoWayAudio: true,
    relay: false,
    live: true,
    talking: false,
    talkPending: false,
  };

  it('is shown for a live camera with two-way audio', () => {
    expect(talkOffered(offer)).toBe(true);
  });

  it('is hidden on the relay', () => {
    expect(talkOffered({ ...offer, relay: true })).toBe(false);
  });

  it('is hidden without two-way audio', () => {
    expect(talkOffered({ ...offer, twoWayAudio: false })).toBe(false);
  });

  it('stays while talking or starting even when the picture is not live', () => {
    expect(talkOffered({ ...offer, live: false })).toBe(false);
    expect(talkOffered({ ...offer, live: false, talking: true })).toBe(true);
    expect(talkOffered({ ...offer, live: false, talkPending: true })).toBe(true);
  });
});
