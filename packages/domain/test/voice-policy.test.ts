import { describe, expect, it } from 'vitest';
import {
  BARGE_IN,
  DEFAULT_PAUSE_MS,
  ECHO_MODES,
  ECHO_POLICY,
  SPEECH_DETECTION,
  VOICE_CALLS_NOTICE,
  VOICE_CAPTION_NOTICE,
  VOICE_DETECTION,
  VOICE_DETECTIONS,
  speechDetectionOf,
} from '../src';

const ACTIVITY = {
  type: 'voice_activity',
  device: { kind: 'phone', id: 'p1' },
  call_id: 'call-1',
  phase: 'listening',
  muted: true,
  superseded_by: null,
  at: 1,
};

describe('voice detection presets', () => {
  it('pins the three sensitivities', () => {
    expect(VOICE_DETECTION).toStrictEqual({
      less: { positiveSpeechThreshold: 0.65, negativeSpeechThreshold: 0.45, minSpeechMs: 240 },
      standard: { positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35, minSpeechMs: 160 },
      more: { positiveSpeechThreshold: 0.25, negativeSpeechThreshold: 0.15, minSpeechMs: 64 },
    });
  });

  it('gets more eager to hear speech from less to more', () => {
    const [less, standard, more] = VOICE_DETECTIONS.map((name) => VOICE_DETECTION[name]);
    expect(VOICE_DETECTIONS).toEqual(['less', 'standard', 'more']);
    for (const preset of [less, standard, more]) {
      expect(preset?.negativeSpeechThreshold).toBeLessThan(preset?.positiveSpeechThreshold ?? 0);
    }
    expect(less?.positiveSpeechThreshold).toBeGreaterThan(standard?.positiveSpeechThreshold ?? 1);
    expect(standard?.positiveSpeechThreshold).toBeGreaterThan(more?.positiveSpeechThreshold ?? 1);
    expect(less?.minSpeechMs).toBeGreaterThan(standard?.minSpeechMs ?? 0);
    expect(standard?.minSpeechMs).toBeGreaterThan(more?.minSpeechMs ?? 0);
  });

  it('builds the detector settings from a sensitivity and a pause', () => {
    expect(speechDetectionOf('standard', 640)).toStrictEqual({
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      minSpeechMs: 160,
      preSpeechPadMs: 320,
      redemptionMs: 640,
      submitUserSpeechOnPause: false,
    });
  });

  it('defaults to the most eager sensitivity with the automatic pause', () => {
    expect(SPEECH_DETECTION).toStrictEqual(speechDetectionOf('more', DEFAULT_PAUSE_MS));
  });
});

describe('echo policy per mode', () => {
  it('pins what each mode does about the assistant echo', () => {
    expect(ECHO_MODES).toEqual(['headphones', 'normal', 'strong', 'no_interrupt']);
    expect(ECHO_POLICY).toStrictEqual({
      headphones: {
        echoTailMs: 0,
        sustainMs: 0,
        bargeInLevelScale: 1,
        ignoreAssistantAudible: true,
        aggressiveWhileAudible: false,
        interruptible: true,
      },
      normal: {
        echoTailMs: BARGE_IN.echoTailMs,
        sustainMs: BARGE_IN.sustainMs,
        bargeInLevelScale: 1,
        ignoreAssistantAudible: false,
        aggressiveWhileAudible: true,
        interruptible: true,
      },
      strong: {
        echoTailMs: 600,
        sustainMs: 400,
        bargeInLevelScale: 2,
        ignoreAssistantAudible: false,
        aggressiveWhileAudible: true,
        interruptible: true,
      },
      no_interrupt: {
        echoTailMs: BARGE_IN.echoTailMs,
        sustainMs: BARGE_IN.sustainMs,
        bargeInLevelScale: 1,
        ignoreAssistantAudible: false,
        aggressiveWhileAudible: true,
        interruptible: false,
      },
    });
  });
});

describe('voice calls notice', () => {
  it('lists the calls that are active', () => {
    const notice = { type: 'voice_calls', calls: [ACTIVITY] };
    expect(VOICE_CALLS_NOTICE.parse(notice)).toStrictEqual(notice);
    expect(VOICE_CALLS_NOTICE.parse({ type: 'voice_calls', calls: [] }).calls).toEqual([]);
  });

  it('refuses another type, a malformed call and unknown fields', () => {
    expect(VOICE_CALLS_NOTICE.safeParse({ type: 'voice_activity', calls: [] }).success).toBe(false);
    expect(
      VOICE_CALLS_NOTICE.safeParse({ type: 'voice_calls', calls: [{ ...ACTIVITY, at: 'now' }] })
        .success,
    ).toBe(false);
    expect(VOICE_CALLS_NOTICE.safeParse({ type: 'voice_calls', calls: [], extra: 1 }).success).toBe(
      false,
    );
    expect(VOICE_CALLS_NOTICE.safeParse({ type: 'voice_calls' }).success).toBe(false);
  });
});

describe('voice caption notice', () => {
  const caption = { type: 'voice_caption', call_id: 'call-1', who: 'assistant', text: 'Hello' };

  it('carries who spoke and what they said', () => {
    expect(VOICE_CAPTION_NOTICE.parse(caption)).toStrictEqual(caption);
    expect(VOICE_CAPTION_NOTICE.parse({ ...caption, who: 'tool', text: '' }).text).toBe('');
  });

  it('refuses another type, a speaker nobody knows, an empty or long call id and unknown fields', () => {
    expect(VOICE_CAPTION_NOTICE.safeParse({ ...caption, type: 'voice_calls' }).success).toBe(false);
    expect(VOICE_CAPTION_NOTICE.safeParse({ ...caption, who: 'robot' }).success).toBe(false);
    expect(VOICE_CAPTION_NOTICE.safeParse({ ...caption, call_id: '' }).success).toBe(false);
    expect(VOICE_CAPTION_NOTICE.safeParse({ ...caption, call_id: 'call-1' }).success).toBe(true);
    expect(VOICE_CAPTION_NOTICE.safeParse({ ...caption, extra: 1 }).success).toBe(false);
    expect(VOICE_CAPTION_NOTICE.safeParse({ ...caption, text: 1 }).success).toBe(false);
  });
});
