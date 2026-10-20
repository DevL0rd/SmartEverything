import {
  VOICE_LEVEL_SHORT_NOTES,
  VOICE_THINKING_COPY,
  voiceChipLabel,
} from './assistant-voice-copy';
import type { OverlayChip, OverlaySetup, OverlayVoice } from './voice-overlay';

function noteOf(voice: OverlayVoice): string {
  if (voice.thinking_level === null) return VOICE_THINKING_COPY.loadFailed;
  if (voice.failed) return VOICE_THINKING_COPY.failed;
  if (voice.changedInCall && !voice.saving) return VOICE_THINKING_COPY.reconnect;
  return VOICE_LEVEL_SHORT_NOTES[voice.thinking_level];
}

function stateOf(voice: OverlayVoice): OverlaySetup['state'] {
  if (voice.failed) return 'failed';
  return voice.saving ? 'saving' : 'ready';
}

export function setupOf(voice: OverlayVoice | null): OverlaySetup {
  if (voice === null) {
    return { level: null, state: 'loading', note: VOICE_THINKING_COPY.loading };
  }
  return { level: voice.thinking_level, state: stateOf(voice), note: noteOf(voice) };
}

export function chipOf(voice: OverlayVoice | null): OverlayChip | null {
  if (voice === null) return null;
  const { thinking_level: level } = voice;
  if (level === null) return null;
  const label = voiceChipLabel(level);
  return {
    level,
    label,
    description: `${label}. Open thinking settings.`,
    warm: voice.saving || voice.failed,
  };
}
