import {
  DEFAULT_VOICE_THINKING,
  VOICE_LEVEL_NAMES,
  VOICE_LEVEL_NOTES,
  VOICE_LIVE_MODEL,
  VOICE_THINKING_LEVELS,
  VOICE_THINKING_MODEL,
  voiceModelFor,
  type AssistantVoiceSettings,
  type VoiceThinkingLevel,
} from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select-picker';

const MODEL_NAMES: Readonly<Record<string, string>> = {
  [VOICE_LIVE_MODEL]: 'Gemini 3.8 Live',
  [VOICE_THINKING_MODEL]: 'Gemini 3.8 Live Extended Thinking',
};

export const VOICE_THINKING_DESCRIPTION =
  'Off is fastest. Higher levels think longer and answer later.';

const DEFAULT_MARK = ' (default)';

export function voiceModelName(model: string): string {
  return MODEL_NAMES[model] ?? model;
}

export const VOICE_THINKING_OPTIONS: readonly SelectOption<string>[] = VOICE_THINKING_LEVELS.map(
  (level) => ({
    value: level,
    label: `${VOICE_LEVEL_NAMES[level]}${level === DEFAULT_VOICE_THINKING ? DEFAULT_MARK : ''}`,
    description: VOICE_LEVEL_NOTES[level],
    wrapDescription: true,
  }),
);

export function thinkingLevelOf(value: string): VoiceThinkingLevel {
  return VOICE_THINKING_LEVELS.find((level) => level === value) ?? DEFAULT_VOICE_THINKING;
}

type VoiceModelSettings = Pick<AssistantVoiceSettings, 'thinking_level' | 'voice'>;

export function thinkingText(level: VoiceThinkingLevel): string {
  return level === 'off' ? 'No thinking' : `${VOICE_LEVEL_NAMES[level]} thinking`;
}

export function voiceModelSummary(voice: VoiceModelSettings): string {
  return [
    voiceModelName(voiceModelFor(voice.thinking_level)),
    thinkingText(voice.thinking_level),
    `${voice.voice} voice`,
  ].join(' · ');
}

export function voiceModelIsDefault(voice: Pick<VoiceModelSettings, 'thinking_level'>): boolean {
  return voice.thinking_level === DEFAULT_VOICE_THINKING;
}
