import { describe, expect, it } from 'vitest';
import { VOICE_MESSAGE_MIME, voiceMessageFile } from './voice-message-file';

describe('voiceMessageFile', () => {
  it('names the recording by its time and types it for transcription', () => {
    const recording = new Uint8Array([1, 2, 3]).buffer;
    const file = voiceMessageFile(recording, new Date('2026-10-18T10:20:30.000Z'));
    expect(file).toMatchObject({
      name: 'voice-message-2026-10-18T10-20-30.m4a',
      mime: VOICE_MESSAGE_MIME,
      bytes: 3,
      preview: null,
    });
  });

  it('hands the recorded bytes back when attached', async () => {
    const recording = new Uint8Array([4, 5]).buffer;
    expect(await voiceMessageFile(recording, new Date(0)).data()).toBe(recording);
  });
});
