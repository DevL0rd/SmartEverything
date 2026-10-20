import { VOICE_THINKING_LEVELS, type VoiceThinkingLevel } from './assistant-voice';

export const VOICE_LEVEL_NAMES: Readonly<Record<VoiceThinkingLevel, string>> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const VOICE_LEVEL_CHOICES = VOICE_THINKING_LEVELS.map((level) => ({
  level,
  name: VOICE_LEVEL_NAMES[level],
}));

export const VOICE_LEVEL_NOTES: Readonly<Record<VoiceThinkingLevel, string>> = {
  off: 'Fastest. Answers in about 3 seconds on a reasoning question. Best for controlling devices and quick questions.',
  low: 'Thinks a little first. Answers in about 5 seconds on a reasoning question. Uses Gemini 3.8 Live Extended Thinking, and thinking is billed as output.',
  medium: 'Thinks longer on hard questions and answers later than Low.',
  high: 'Smartest and slowest. Answers in about 7 seconds on a reasoning question and costs the most.',
};

export const VOICE_LEVEL_SHORT_NOTES: Readonly<Record<VoiceThinkingLevel, string>> = {
  off: 'Fastest. Answers right away.',
  low: 'Thinks a little first, then answers.',
  medium: 'Thinks longer on hard questions.',
  high: 'Smartest and slowest.',
};

export const VOICE_THINKING_COPY = {
  section: 'Thinking',
  group: 'Thinking level',
  saving: 'Saving…',
  loading: 'Loading thinking setting…',
  loadFailed: 'Could not load the thinking setting. Check the connection and try again.',
  failed: 'Could not save. Check the connection and try again.',
  reconnect: 'Applies after the call reconnects. To use it now, start a new call.',
} as const;

export function voiceChipLabel(level: VoiceThinkingLevel): string {
  return level === 'off' ? 'Thinking off' : `Thinking: ${VOICE_LEVEL_NAMES[level]}`;
}
