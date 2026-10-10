import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NO_PRICES, type AiUsageRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachmentNote } from '../../src/assistant/attachment-note';
import {
  MediaNotes,
  type MediaNoteInput,
  type MediaNoteProvider,
} from '../../src/transcripts/media-notes';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const PRICING = {
  ...NO_PRICES,
  input_per_mtok: 1,
  output_per_mtok: 2,
  audio_in_per_mtok: 3,
  video_in_per_mtok: 4,
};

class FakeProvider implements MediaNoteProvider {
  readonly inputs: MediaNoteInput[] = [];

  describe(input: MediaNoteInput): Promise<{ text: string; usage: { promptTokenCount: number } }> {
    this.inputs.push(input);
    return Promise.resolve({
      text: ' hello there ',
      usage: { promptTokenCount: 100 },
    });
  }
}

let test: TestStore;
let provider: FakeProvider;
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
  notes = new MediaNotes({
    provider,
    chat: test.store.assistantChat,
    ledger: test.store.ledger,
    prices: { priceOf: (): typeof PRICING => PRICING },
    filesRoot: test.directory,
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
    expect(provider.inputs).toHaveLength(1);
    expect(test.store.assistantChat.attachment(id).transcript).toBe('hello there');
    expect(booked.map((row) => row.work)).toEqual(['transcribe']);
    expect(booked[0]?.cost_micros).toBeGreaterThan(0);
  });

  it('refuses a file that is not audio, video or an image', async () => {
    const id = await stored('application/pdf', 'paper.pdf');
    await expect(notes.ensure(test.store.assistantChat.attachment(id))).rejects.toThrow(
      'not audio, video or an image',
    );
    expect(provider.inputs).toHaveLength(0);
  });

  it('writes older media into the history as text', () => {
    const file = {
      id: crypto.randomUUID(),
      name: 'clip.ogg',
      mime: 'audio/ogg',
      bytes: 5,
      width: null,
      height: null,
    };
    expect(attachmentNote(file, 'turn the lights on')).toBe(
      '[audio "clip.ogg", transcript: turn the lights on]',
    );
    expect(attachmentNote(file, null)).toBe('[Attached clip.ogg (audio/ogg)]');
  });
});
