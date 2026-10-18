import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiUsageRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  TranscriptionAnswer,
  TranscriptionInput,
  TranscriptionProvider,
} from '../../src/openrouter/transcription';
import {
  MediaNotes,
  type MediaNoteAnswer,
  type MediaNoteInput,
  type MediaNoteProvider,
} from '../../src/transcripts/media-notes';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

class FakeProvider implements MediaNoteProvider {
  readonly inputs: MediaNoteInput[] = [];

  describe(input: MediaNoteInput): Promise<MediaNoteAnswer> {
    this.inputs.push(input);
    return Promise.resolve({
      text: ' a cat on a sofa ',
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 },
    });
  }
}

class FakeTranscription implements TranscriptionProvider {
  readonly inputs: TranscriptionInput[] = [];

  transcribe(input: TranscriptionInput): Promise<TranscriptionAnswer> {
    this.inputs.push(input);
    return Promise.resolve({
      text: ' hello there ',
      usage: { seconds: 4, input_tokens: 100, cost: 0.002 },
    });
  }
}

let test: TestStore;
let provider: FakeProvider;
let transcription: FakeTranscription;
let notes: MediaNotes;

async function stored(mime: string, name: string): Promise<string> {
  const profile = test.store.profiles.first();
  const id = crypto.randomUUID();
  await mkdir(join(test.directory, 'files', id), { recursive: true });
  await writeFile(join(test.directory, 'files', id, name), 'bytes');
  test.store.assistantChat.addAttachment({
    id,
    profile_id: profile.id,
    name,
    mime,
    bytes: 5,
    width: null,
    height: null,
    storage_path: join('files', id, name),
    sha256: 'a'.repeat(64),
  });
  return id;
}

beforeEach(async () => {
  test = await testStore();
  provider = new FakeProvider();
  transcription = new FakeTranscription();
  notes = new MediaNotes({
    provider,
    transcriptionProvider: transcription,
    chat: test.store.assistantChat,
    ledger: test.store.ledger,
    filesRoot: test.directory,
    describeImages: (): boolean => false,
    inputModalities: (): readonly string[] | null => null,
    log: testLogger('media-notes'),
  });
});

afterEach(async () => {
  await test.close();
});

describe('media transcripts', () => {
  it('transcribes a voice message once, keeps it and books the cost', async () => {
    const id = await stored('audio/ogg', 'voice.ogg');
    const booked: AiUsageRow[] = [];
    test.store.ledger.on((row): void => {
      booked.push(row);
    });
    const file = test.store.assistantChat.attachment(id);
    const [first, second] = await Promise.all([notes.ensure(file), notes.ensure(file)]);
    const third = await notes.ensure(test.store.assistantChat.attachment(id));
    expect([first, second, third]).toEqual(['hello there', 'hello there', 'hello there']);
    expect(transcription.inputs).toHaveLength(1);
    expect(transcription.inputs[0]?.format).toBe('ogg');
    expect(provider.inputs).toHaveLength(0);
    expect(test.store.assistantChat.attachment(id).transcript).toBe('hello there');
    expect(booked.map((row) => row.work)).toEqual(['transcribe']);
    expect(booked[0]?.cost_micros).toBeGreaterThan(0);
  });

  it('describes an image for a model that cannot see, once, and books the cost', async () => {
    const id = await stored('image/png', 'cat.png');
    const file = test.store.assistantChat.attachment(id);
    const [first, second] = await Promise.all([notes.ensure(file), notes.ensure(file)]);
    expect([first, second]).toEqual(['a cat on a sofa', 'a cat on a sofa']);
    expect(provider.inputs).toHaveLength(1);
    expect(test.store.assistantChat.attachment(id).transcript).toBe('a cat on a sofa');
  });

  it('describes a video once, keeps the note and books the cost', async () => {
    const id = await stored('video/mp4', 'clip.mp4');
    const booked: AiUsageRow[] = [];
    test.store.ledger.on((row): void => {
      booked.push(row);
    });
    const file = test.store.assistantChat.attachment(id);
    const [first, second] = await Promise.all([notes.ensure(file), notes.ensure(file)]);
    expect([first, second]).toEqual(['a cat on a sofa', 'a cat on a sofa']);
    expect(provider.inputs).toHaveLength(1);
    expect(transcription.inputs).toHaveLength(0);
    expect(test.store.assistantChat.attachment(id).transcript).toBe('a cat on a sofa');
    expect(booked[0]?.cost_micros).toBeGreaterThan(0);
  });

  it('refuses a file that is not audio, video or an image', async () => {
    const id = await stored('application/pdf', 'paper.pdf');
    await expect(notes.ensure(test.store.assistantChat.attachment(id))).rejects.toThrow(
      'not audio, video or an image',
    );
    expect(provider.inputs).toHaveLength(0);
    expect(transcription.inputs).toHaveLength(0);
  });
});
