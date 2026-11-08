import type { PickedFile } from '../../../platform/pick-files';

export const VOICE_MESSAGE_MIME = 'audio/mp4';
const DEFAULT_EXTENSION = 'm4a';

const RECORDING_EXTENSIONS: Readonly<Record<string, string>> = {
  [VOICE_MESSAGE_MIME]: DEFAULT_EXTENSION,
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

const STAMP_LENGTH = 19;

export function voiceMessageFile(
  recording: ArrayBuffer,
  at: Date,
  recordingMime = '',
  levels: readonly number[] | null = null,
): PickedFile {
  const stamp = at.toISOString().slice(0, STAMP_LENGTH).replaceAll(':', '-');
  const type = recordingMime.split(';', 1).join('').trim().toLowerCase();
  const extension = RECORDING_EXTENSIONS[type];
  return {
    name: `voice-message-${stamp}.${extension ?? DEFAULT_EXTENSION}`,
    mime: extension === undefined ? VOICE_MESSAGE_MIME : type,
    bytes: recording.byteLength,
    preview: null,
    ...(levels === null ? {} : { levels }),
    data: () => Promise.resolve(recording),
  };
}
