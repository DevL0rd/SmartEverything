import type { PickedFile } from '../../../platform/pick-files';

export const VOICE_MESSAGE_MIME = 'audio/mp4';

const EXTENSION = 'm4a';

const STAMP_LENGTH = 19;

export function voiceMessageFile(recording: ArrayBuffer, at: Date): PickedFile {
  const stamp = at.toISOString().slice(0, STAMP_LENGTH).replaceAll(':', '-');
  return {
    name: `voice-message-${stamp}.${EXTENSION}`,
    mime: VOICE_MESSAGE_MIME,
    bytes: recording.byteLength,
    preview: null,
    data: () => Promise.resolve(recording),
  };
}
