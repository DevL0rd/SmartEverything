import { z } from 'zod';
import { CAPTION_SPEAKERS } from './assistant-voice';
import { CALL_PHASE } from './voice-overlay';

export const ECHO_MODES = ['headphones', 'normal', 'strong', 'no_interrupt'] as const;

export type EchoMode = (typeof ECHO_MODES)[number];

export const VOICE_DETECTIONS = ['less', 'standard', 'more'] as const;

export type VoiceDetection = (typeof VOICE_DETECTIONS)[number];

export const DEFAULT_VOICE_DETECTION: VoiceDetection = 'more';

export const PAUSE_CHOICES_MS = [200, 320, 640, 1000, 2500] as const;

export type PauseChoiceMs = (typeof PAUSE_CHOICES_MS)[number];

export const DEFAULT_PAUSE_MS: PauseChoiceMs = 200;

export const PAUSE_MS = z.union([
  z.literal(PAUSE_CHOICES_MS[0]),
  z.literal(PAUSE_CHOICES_MS[1]),
  z.literal(PAUSE_CHOICES_MS[2]),
  z.literal(PAUSE_CHOICES_MS[3]),
  z.literal(PAUSE_CHOICES_MS[4]),
]);

export interface VoiceDetectionPreset {
  readonly positiveSpeechThreshold: number;
  readonly negativeSpeechThreshold: number;
  readonly minSpeechMs: number;
}

export const VOICE_DETECTION: Readonly<Record<VoiceDetection, VoiceDetectionPreset>> = {
  less: { positiveSpeechThreshold: 0.65, negativeSpeechThreshold: 0.45, minSpeechMs: 240 },
  standard: { positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35, minSpeechMs: 160 },
  more: { positiveSpeechThreshold: 0.25, negativeSpeechThreshold: 0.15, minSpeechMs: 64 },
};

export interface SpeechDetection extends VoiceDetectionPreset {
  readonly preSpeechPadMs: number;
  readonly redemptionMs: number;
  readonly submitUserSpeechOnPause: boolean;
}

export function speechDetectionOf(detection: VoiceDetection, pauseMs: number): SpeechDetection {
  return {
    ...VOICE_DETECTION[detection],
    preSpeechPadMs: 320,
    redemptionMs: pauseMs,
    submitUserSpeechOnPause: false,
  };
}

export const SPEECH_DETECTION: SpeechDetection = speechDetectionOf(
  DEFAULT_VOICE_DETECTION,
  DEFAULT_PAUSE_MS,
);

export const BARGE_IN = { probability: 0.8, sustainMs: 192, echoTailMs: 300 } as const;

export const BARGE_IN_LEVEL = { echoCancelled: 0.03, raw: 0.125 } as const;

export interface EchoPolicy {
  readonly echoTailMs: number;
  readonly sustainMs: number;
  readonly bargeInLevelScale: number;
  readonly ignoreAssistantAudible: boolean;
  readonly aggressiveWhileAudible: boolean;
  readonly interruptible: boolean;
}

export const ECHO_POLICY: Readonly<Record<EchoMode, EchoPolicy>> = {
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
};

export const SPEECH_PREROLL_MS = 640;

export interface TalkGateEvents {
  readonly open: () => void;
  readonly close: () => void;
}

export interface HeardFrame {
  readonly probability: number;
  readonly level: number;
  readonly durationMs: number;
  readonly assistantAudible: boolean;
  readonly at: number;
}

export class TalkGate {
  private opened = false;
  private confirmed: { readonly overEcho: boolean } | null = null;
  private bargeMs = 0;
  private audibleAt = Number.NEGATIVE_INFINITY;
  private lastAt = 0;

  constructor(
    private readonly events: TalkGateEvents,
    private readonly bargeInLevel: number,
    private policy: EchoPolicy = ECHO_POLICY.normal,
  ) {}

  get open(): boolean {
    return this.opened;
  }

  setPolicy(policy: EchoPolicy): void {
    this.policy = policy;
    this.consider();
  }

  frame(frame: HeardFrame): void {
    this.lastAt = frame.at;
    if (frame.assistantAudible && !this.policy.ignoreAssistantAudible) {
      this.audibleAt = frame.at;
    }
    const confident =
      frame.probability >= BARGE_IN.probability &&
      frame.level >= this.bargeInLevel * this.policy.bargeInLevelScale;
    this.bargeMs = confident ? this.bargeMs + frame.durationMs : 0;
    this.consider();
  }

  speechConfirmed(): void {
    this.confirmed = { overEcho: !this.quiet() };
    this.consider();
  }

  speechEnded(): void {
    this.confirmed = null;
    this.bargeMs = 0;
    if (this.opened) {
      this.opened = false;
      this.events.close();
    }
  }

  private consider(): void {
    if (this.opened || this.confirmed === null) {
      return;
    }
    const clear = !this.confirmed.overEcho && this.quiet();
    if (clear || (this.policy.interruptible && this.bargeMs >= this.policy.sustainMs)) {
      this.opened = true;
      this.events.open();
    }
  }

  private quiet(): boolean {
    return this.lastAt - this.audibleAt > this.policy.echoTailMs;
  }
}

export class Preroll<T> {
  private items: { readonly item: T; readonly ms: number }[] = [];
  private heldMs = 0;

  constructor(private readonly keepMs: number) {}

  push(item: T, ms: number): void {
    this.items.push({ item, ms });
    this.heldMs += ms;
    for (
      let first = this.items[0];
      first !== undefined && this.heldMs - first.ms >= this.keepMs;
      first = this.items[0]
    ) {
      this.items.shift();
      this.heldMs -= first.ms;
    }
  }

  peek(): T[] {
    return this.items.map((entry) => entry.item);
  }

  take(): T[] {
    const taken = this.items.map((entry) => entry.item);
    this.items = [];
    this.heldMs = 0;
    return taken;
  }
}

export function levelOf(samples: Int16Array | Float32Array, fullScale: number): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const sample of samples) {
    sum += (sample / fullScale) ** 2;
  }
  return Math.sqrt(sum / samples.length);
}

export const VOICE_ACTIVITY_DEVICE_KINDS = ['computer', 'phone'] as const;

export const VOICE_ACTIVITY_NOTICE = z.strictObject({
  type: z.literal('voice_activity'),
  device: z.strictObject({ kind: z.enum(VOICE_ACTIVITY_DEVICE_KINDS), id: z.string().min(1) }),
  call_id: z.string().min(1),
  phase: CALL_PHASE,
  muted: z.boolean(),
  superseded_by: z.string().min(1).nullable(),
  at: z.number(),
});
export type VoiceActivityNotice = z.infer<typeof VOICE_ACTIVITY_NOTICE>;

export const VOICE_CALLS_NOTICE = z.strictObject({
  type: z.literal('voice_calls'),
  calls: z.array(VOICE_ACTIVITY_NOTICE),
});
export type VoiceCallsNotice = z.infer<typeof VOICE_CALLS_NOTICE>;

export const VOICE_LEVEL_MAX = 255;
const LEVEL_BYTE = z.number().int().min(0).max(VOICE_LEVEL_MAX);

export const VOICE_LEVELS_NOTICE = z.strictObject({
  type: z.literal('voice_levels'),
  call_id: z.string().min(1),
  in: LEVEL_BYTE,
  out: LEVEL_BYTE,
});
export type VoiceLevelsNotice = z.infer<typeof VOICE_LEVELS_NOTICE>;

export const VOICE_CAPTION_NOTICE = z.strictObject({
  type: z.literal('voice_caption'),
  call_id: z.string().min(1),
  who: z.enum(CAPTION_SPEAKERS),
  text: z.string(),
});
export type VoiceCaptionNotice = z.infer<typeof VOICE_CAPTION_NOTICE>;

export const VOICE_LEVELS_WATCH = z.strictObject({
  type: z.literal('voice_levels_watch'),
  call_id: z.string().min(1).nullable(),
});
export type VoiceLevelsWatch = z.infer<typeof VOICE_LEVELS_WATCH>;

export function voiceLevelByte(level: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
  return Math.round(clamped * VOICE_LEVEL_MAX);
}

export function voiceLevelOf(byte: number): number {
  return Math.min(1, Math.max(0, byte / VOICE_LEVEL_MAX));
}
