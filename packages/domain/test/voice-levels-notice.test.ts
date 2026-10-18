import { describe, expect, it } from 'vitest';
import {
  VOICE_ACTIVITY_NOTICE,
  VOICE_LEVELS_NOTICE,
  VOICE_LEVELS_WATCH,
  voiceLevelByte,
  voiceLevelOf,
} from '../src/voice-activity';

describe('voice activity notice', () => {
  const notice = {
    type: 'voice_activity',
    device: { kind: 'computer', id: 'c1' },
    call_id: 'call-1',
    phase: 'speaking',
    muted: false,
    superseded_by: null,
    at: 5,
  };

  it('round trips through JSON and refuses an unknown phase', () => {
    expect(VOICE_ACTIVITY_NOTICE.parse(JSON.parse(JSON.stringify(notice)))).toEqual(notice);
    expect(VOICE_ACTIVITY_NOTICE.safeParse({ ...notice, phase: 'dialing' }).success).toBe(false);
  });

  it('names who answered when a claim was superseded', () => {
    const answered = { ...notice, phase: 'ended', superseded_by: 'Living room camera' };
    expect(VOICE_ACTIVITY_NOTICE.parse(answered).superseded_by).toBe('Living room camera');
    expect(VOICE_ACTIVITY_NOTICE.safeParse({ ...notice, superseded_by: '' }).success).toBe(false);
  });
});

describe('voice levels', () => {
  it('carries one byte per side', () => {
    const levels = { type: 'voice_levels', call_id: 'call-1', in: 12, out: 255 };
    expect(VOICE_LEVELS_NOTICE.parse(levels)).toEqual(levels);
    expect(VOICE_LEVELS_NOTICE.safeParse({ ...levels, in: 256 }).success).toBe(false);
    expect(VOICE_LEVELS_NOTICE.safeParse({ ...levels, out: 0.5 }).success).toBe(false);
  });

  it('starts and stops a watch with a call id or null', () => {
    expect(VOICE_LEVELS_WATCH.parse({ type: 'voice_levels_watch', call_id: 'a' }).call_id).toBe(
      'a',
    );
    expect(
      VOICE_LEVELS_WATCH.parse({ type: 'voice_levels_watch', call_id: null }).call_id,
    ).toBeNull();
    expect(VOICE_LEVELS_WATCH.safeParse({ type: 'voice_levels_watch', call_id: '' }).success).toBe(
      false,
    );
  });

  it('maps a level to a byte and back', () => {
    expect(voiceLevelByte(0)).toBe(0);
    expect(voiceLevelByte(1)).toBe(255);
    expect(voiceLevelByte(2)).toBe(255);
    expect(voiceLevelByte(-1)).toBe(0);
    expect(voiceLevelByte(Number.NaN)).toBe(0);
    expect(voiceLevelOf(255)).toBe(1);
    expect(voiceLevelOf(voiceLevelByte(0.5))).toBeCloseTo(0.5, 2);
  });
});
