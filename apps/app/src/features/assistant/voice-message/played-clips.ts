import {
  localPref,
  setLocalPref,
  useLocalPref,
  type LocalPrefValue,
} from '../../../store/local-prefs';

type VoiceClips = LocalPrefValue<'voiceClips'>;

export type ClipSpeed = VoiceClips['speed'];

export const CLIP_SPEEDS: readonly ClipSpeed[] = [1, 1.5, 2];

export function nextClipSpeed(speed: ClipSpeed): ClipSpeed {
  const index = CLIP_SPEEDS.indexOf(speed);
  return CLIP_SPEEDS[(index + 1) % CLIP_SPEEDS.length] ?? 1;
}

export function markClipPlayed(attachmentId: string): void {
  const clips = localPref('voiceClips');
  if (clips.played.includes(attachmentId)) return;
  setLocalPref('voiceClips', { ...clips, played: [...clips.played, attachmentId] });
}

export function cycleClipSpeed(): void {
  const clips = localPref('voiceClips');
  setLocalPref('voiceClips', { ...clips, speed: nextClipSpeed(clips.speed) });
}

export function useClipPlayed(attachmentId: string | null): boolean {
  const played = useLocalPref('voiceClips').played;
  return attachmentId === null || played.includes(attachmentId);
}

export function useClipSpeed(): ClipSpeed {
  return useLocalPref('voiceClips').speed;
}
