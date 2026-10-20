import {
  GOOGLE_MODELS,
  LIVE_CONTEXT_MINUTES,
  SIGHT_TOKENS_PER_FRAME,
  type AssistantSettings,
  type SightMode,
  type SightResolution,
  voiceModelFor,
} from '@smarteverything/domain';
import { AUDIO_TOKENS_PER_SECOND } from '../ledger/gemini-live';
import type { LiveWindow } from './gemini';

const SECONDS_PER_MINUTE = 60;
const INSTRUCTION_TOKENS = 6000;
const LIVE_TRIGGER_SHARE = 1.25;
const HISTORY_TOKENS_PER_MINUTE = 1000;
const HISTORY_CHARS_PER_TOKEN = 4;
const SIGHT_WORDS_TOKENS = 6000;
const SIGHT_TRIGGER_SHARE = 1.5;

export interface SightTuning {
  readonly mode: SightMode;
  readonly resolution: SightResolution;
  readonly memorySeconds: number;
}

export function sameTuning(left: SightTuning | null, right: SightTuning | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.mode === right.mode &&
    left.resolution === right.resolution &&
    left.memorySeconds === right.memorySeconds
  );
}

export function sightWindow(tuning: SightTuning, base: LiveWindow | null): LiveWindow {
  const pictures = tuning.memorySeconds * SIGHT_TOKENS_PER_FRAME[tuning.resolution];
  if (base !== null) {
    return {
      triggerTokens: base.triggerTokens + pictures,
      targetTokens: base.targetTokens + pictures,
    };
  }
  const target = SIGHT_WORDS_TOKENS + pictures;
  return { triggerTokens: Math.ceil(target * SIGHT_TRIGGER_SHARE), targetTokens: target };
}

export function liveMinutes(settings: AssistantSettings): number {
  return settings.voice.live_context_minutes ?? LIVE_CONTEXT_MINUTES.fallback;
}

export function historyCharacters(settings: AssistantSettings): number {
  return liveMinutes(settings) * HISTORY_TOKENS_PER_MINUTE * HISTORY_CHARS_PER_TOKEN;
}

export function liveWindow(settings: AssistantSettings): LiveWindow {
  const target =
    INSTRUCTION_TOKENS + liveMinutes(settings) * SECONDS_PER_MINUTE * AUDIO_TOKENS_PER_SECOND;
  const length = GOOGLE_MODELS.find(
    (model) => model.id === `google:${voiceModelFor(settings.voice.thinking_level)}`,
  )?.contextLength;
  const cap = length ?? Infinity;
  return {
    triggerTokens: Math.min(cap, Math.ceil(target * LIVE_TRIGGER_SHARE)),
    targetTokens: Math.min(cap, target),
  };
}

const CATCH_UP_CHARS_PER_TOKEN = 3;

export function catchUpCharacters(window: LiveWindow | null): number {
  const history =
    window === null
      ? LIVE_CONTEXT_MINUTES.fallback * SECONDS_PER_MINUTE * AUDIO_TOKENS_PER_SECOND
      : Math.max(0, window.targetTokens - INSTRUCTION_TOKENS);
  return history * CATCH_UP_CHARS_PER_TOKEN;
}

export function newest(lines: readonly string[], budget: number): string[] {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines.toReversed()) {
    used += line.length;
    if (used > budget) {
      break;
    }
    kept.unshift(line);
  }
  return kept;
}
