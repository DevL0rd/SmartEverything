import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssistantFiles } from '../../src/assistant/files';
import type { StoredAttachment } from '../../src/store/repositories/assistant-chat';
import { testStore, type TestStore } from '../support/store';
import { hubLayout } from '../../src/data-layout';

let test: TestStore;
let files: AssistantFiles;

function wav(seconds: number, amplitude: number): Buffer {
  const samples = Buffer.alloc(8000 * 2 * seconds);
  for (let offset = 0; offset < samples.length; offset += 2)
    samples.writeInt16LE(amplitude, offset);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

beforeEach(async () => {
  test = await testStore();
  files = new AssistantFiles({
    layout: hubLayout(test.directory, {}),
    chat: test.store.assistantChat,
    now: (): Date => new Date(),
  });
});

afterEach(async () => {
  await test.close();
});

const profile = (): string => test.store.profiles.first().id;

function keep(name: string, mime: string, content: Buffer): Promise<StoredAttachment> {
  return files.keepBytes({
    profileId: profile(),
    name,
    mime,
    content,
    signal: new AbortController().signal,
    authorize: () => undefined,
  });
}

describe('attachment levels', () => {
  it('computes levels for audio when it is written', async () => {
    const clip = await keep('reply.wav', 'audio/wav', wav(1, 16384));
    expect(clip.levels).toHaveLength(20);
    expect(test.store.assistantChat.attachment(clip.id).levels).toEqual(clip.levels);
  });

  it('leaves non-audio files without levels', async () => {
    const note = await keep('note.txt', 'text/plain', Buffer.from('hello'));
    expect(note.levels).toBeNull();
  });

  it('keeps no levels for audio that cannot be decoded', async () => {
    const clip = await keep('broken.wav', 'audio/wav', Buffer.from('not audio'));
    expect(clip.levels).toBeNull();
  });

  it('keeps the series the recorder uploaded instead of decoding again', async () => {
    const upload = await files.start({
      profileId: profile(),
      name: 'voice.m4a',
      mime: 'audio/mp4',
      bytes: 3,
      levels: [1, 2, 3],
    });
    await files.chunk(profile(), upload.uploadId, 0, Buffer.from('abc').toString('base64'));
    const clip = await files.finish(profile(), upload.uploadId);
    expect(clip.levels).toEqual([1, 2, 3]);
  });

  it('fills the levels of audio stored before they existed', async () => {
    const id = crypto.randomUUID();
    const content = wav(1, 32767);
    const stored = test.layout.person(profile()).attachment(id, 'old.wav');
    await mkdir(dirname(stored), { recursive: true });
    await writeFile(stored, content);
    test.store.assistantChat.addAttachment({
      id,
      profile_id: profile(),
      name: 'old.wav',
      mime: 'audio/wav',
      bytes: content.length,
      width: null,
      height: null,
      storage_path: join('files', id, 'old.wav'),
      sha256: (await import('node:crypto')).createHash('sha256').update(content).digest('hex'),
    });
    await files.backfillLevels();
    const levels = test.store.assistantChat.attachment(id).levels;
    expect(levels).toHaveLength(20);
    expect(levels?.every((level) => level >= 254)).toBe(true);
    expect(test.store.assistantChat.unleveledAudio()).toEqual([]);
  });
});
