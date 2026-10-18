import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssistantFiles } from '../../src/assistant/files';
import type { StoredAttachment } from '../../src/store/repositories/assistant-chat';
import type { TranscriptionProvider } from '../../src/openrouter/transcription';
import {
  MediaNotes,
  type MediaNoteAnswer,
  type MediaNoteInput,
  type MediaNoteProvider,
} from '../../src/transcripts/media-notes';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let files: AssistantFiles;
let calls: number;
let behaviour: () => Promise<MediaNoteAnswer>;
let describeImages = false;
let modalities: readonly string[] | null = null;

class Provider implements MediaNoteProvider {
  describe(_input: MediaNoteInput): Promise<MediaNoteAnswer> {
    calls += 1;
    return behaviour();
  }
}

async function stored(mime: string, name: string): Promise<StoredAttachment> {
  const id = crypto.randomUUID();
  await mkdir(join(test.directory, 'files', id), { recursive: true });
  await writeFile(join(test.directory, 'files', id, name), 'bytes');
  test.store.assistantChat.addAttachment({
    id,
    profile_id: test.store.profiles.first().id,
    name,
    mime,
    bytes: 5,
    width: null,
    height: null,
    storage_path: join('files', id, name),
    sha256: 'b'.repeat(64),
  });
  return test.store.assistantChat.attachment(id);
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(async () => {
  test = await testStore();
  calls = 0;
  describeImages = false;
  modalities = null;
  behaviour = (): Promise<MediaNoteAnswer> => Promise.resolve({ text: 'a clip', usage: null });
  files = new AssistantFiles({
    dataDirectory: test.directory,
    chat: test.store.assistantChat,
    now: (): Date => new Date(),
  });
  const transcription: TranscriptionProvider = {
    transcribe: () => Promise.reject(new Error('unused')),
  };
  files.attachMediaNotes(
    new MediaNotes({
      provider: new Provider(),
      transcriptionProvider: transcription,
      chat: test.store.assistantChat,
      ledger: test.store.ledger,
      filesRoot: test.directory,
      describeImages: (): boolean => describeImages,
      inputModalities: (): readonly string[] | null => modalities,
      log: testLogger('note-of'),
    }),
  );
});

afterEach(async () => {
  await test.close();
});

describe('reading a media note for a turn', () => {
  it('returns at once while the caption call is still pending', async () => {
    behaviour = (): Promise<MediaNoteAnswer> => new Promise<MediaNoteAnswer>(() => undefined);
    const file = await stored('video/mp4', 'clip.mp4');
    const line = files.noteLine(file);
    expect(line).toContain('Transcript pending.');
    expect(line).toContain(`read_chats view attachment with id ${file.id}`);
    await settle();
    expect(calls).toBe(1);
  });

  it('returns at once when the caption call fails and never throws', async () => {
    behaviour = (): Promise<MediaNoteAnswer> => Promise.reject(new Error('OpenRouter is busy'));
    const file = await stored('video/mp4', 'clip.mp4');
    expect(files.noteOf(file)).toBeNull();
    await settle();
    expect(files.noteOf(file)).toBeNull();
  });

  it('uses the stored note without calling the provider', async () => {
    const file = await stored('video/mp4', 'clip.mp4');
    test.store.assistantChat.setTranscript(file.id, 'a clip');
    const line = files.noteLine(test.store.assistantChat.attachment(file.id));
    expect(line).toContain('Transcript: a clip');
    expect(line).toContain(`read_chats view attachment with id ${file.id}`);
    await settle();
    expect(calls).toBe(0);
  });
});

describe('images follow the model and the setting', () => {
  it('make no call for a vision model while the setting is off', async () => {
    modalities = ['text', 'image'];
    const file = await stored('image/png', 'cat.png');
    const line = files.noteLine(file);
    expect(line).toContain(`id ${file.id}`);
    expect(line).not.toContain('pending');
    await settle();
    expect(calls).toBe(0);
  });

  it('describe in the background for a vision model once the setting is on', async () => {
    modalities = ['text', 'image'];
    describeImages = true;
    const file = await stored('image/png', 'cat.png');
    expect(files.noteLine(file)).toContain('Description pending.');
    await settle();
    expect(calls).toBe(1);
    expect(files.noteLine(file)).toContain('Description: a clip');
  });

  it('always describe for a model that cannot see them', async () => {
    modalities = ['text'];
    const file = await stored('image/png', 'cat.png');
    files.noteLine(file);
    await settle();
    expect(calls).toBe(1);
  });

  it('describe when the model is unknown', async () => {
    const file = await stored('image/png', 'cat.png');
    files.noteLine(file);
    await settle();
    expect(calls).toBe(1);
  });
});
