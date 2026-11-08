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

  it('keeps a web recording in its original format', () => {
    const recording = new Uint8Array([1, 2, 3]).buffer;
    expect(voiceMessageFile(recording, new Date(0), 'audio/webm;codecs=opus')).toMatchObject({
      name: 'voice-message-1970-01-01T00-00-00.webm',
      mime: 'audio/webm',
    });
  });

  it('carries the captured level series with the file', () => {
    const recording = new Uint8Array([1]).buffer;
    expect(voiceMessageFile(recording, new Date(0), '', [0, 128, 255]).levels).toEqual([
      0, 128, 255,
    ]);
  });

  it('sends no levels when none were captured', () => {
    const recording = new Uint8Array([1]).buffer;
    expect(voiceMessageFile(recording, new Date(0)).levels).toBeUndefined();
  });
});
