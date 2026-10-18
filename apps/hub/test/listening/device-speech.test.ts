import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeviceSpeech } from '../../src/listening/device-speech';
import { phoneExternalId } from '../../src/phones/phone-device';
import { Transcripts } from '../../src/transcripts/transcript-service';
import type { TranscribeRequest } from '../../src/transcripts/transcriber';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = '2026-10-18T10:00:00.000Z';
const SAMPLES_PER_SECOND = 16_000;

let opened: TestStore;
let clock: FakeClock;
let transcripts: Transcripts;
let speech: DeviceSpeech;
let phone: string;
let key: boolean;
let capped: boolean;
let requests: TranscribeRequest[];
let reasons: (string | null)[];
let answers: (string | null)[];

function segment(startMs: number, seconds: number): Parameters<DeviceSpeech['segment']>[1] {
  return {
    startedAt: Date.parse(START) + startMs,
    endedAt: Date.parse(START) + startMs + seconds * 1000,
    pcm: new Int16Array(seconds * SAMPLES_PER_SECOND).fill(6000),
  };
}

async function settled(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
}

async function say(startMs: number, seconds: number): Promise<void> {
  speech.segment(phone, segment(startMs, seconds));
  speech.finish(phone);
  await settled();
}

beforeEach(async () => {
  opened = await testStore();
  clock = new FakeClock(START);
  key = true;
  capped = false;
  requests = [];
  reasons = [];
  answers = ['Turn the lights on.'];
  transcripts = new Transcripts({ store: opened.store, clock, log: testLogger('transcripts') });
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: phoneExternalId(crypto.randomUUID()),
      parentId: null,
      kind: 'phone',
      name: 'Pixel',
      model: 'm',
      manufacturer: 'm',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: { profileId: opened.store.profiles.first().id },
    },
  ]);
  phone = row?.id ?? '';
  speech = new DeviceSpeech({
    source: 'phone',
    store: opened.store,
    transcripts,
    transcriber: {
      transcribe: (request): Promise<string | null> => {
        requests.push(request);
        return Promise.resolve(answers.shift() ?? null);
      },
    },
    budget: { capReached: (): boolean => capped },
    keyPresent: (): boolean => key,
    names: (): string[] => ['Friday'],
    paused: (_deviceId, reason): void => {
      reasons.push(reason);
    },
    clock,
    log: testLogger('transcripts'),
  });
});

afterEach(async () => {
  await opened.close();
});

describe('phone speech', () => {
  it('writes a heard utterance into a phone session for the day', async () => {
    await say(0, 2);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ meta: { listening: 'phone', device_id: phone } });
    const [session] = opened.store.transcripts.list({ source: 'phone', limit: 10 });
    expect(session).toMatchObject({ source: 'phone', source_id: phone });
    expect(
      opened.store.transcripts.lines(session?.id ?? '', 0, 100).map((line) => line.text),
    ).toEqual(['Turn the lights on.']);
  });

  it('keeps one session for the day and hands the last lines to the next transcription', async () => {
    answers = ['First.', 'Second.'];
    await say(0, 2);
    await say(10_000, 2);
    expect(opened.store.transcripts.list({ source: 'phone', limit: 10 })).toHaveLength(1);
    expect(requests[1]?.recent).toEqual(['First.']);
  });

  it('drops silence hallucinations and an immediate repeat', async () => {
    answers = ['Thank you.', 'Same thing.', 'Same thing.'];
    await say(0, 2);
    await say(10_000, 2);
    await say(20_000, 2);
    const [session] = opened.store.transcripts.list({ source: 'phone', limit: 10 });
    expect(
      opened.store.transcripts.lines(session?.id ?? '', 0, 100).map((line) => line.text),
    ).toEqual(['Same thing.']);
  });

  it('pauses without a key or after the cap and says so once, then resumes', async () => {
    key = false;
    await say(0, 2);
    await say(10_000, 2);
    expect(requests).toHaveLength(0);
    expect(reasons).toEqual(['no_openrouter_key']);
    key = true;
    await say(20_000, 2);
    expect(reasons).toEqual(['no_openrouter_key', null]);
    capped = true;
    await say(30_000, 2);
    expect(reasons.at(-1)).toBe('cap_reached');
  });

  it('skips a segment that is too quiet or too short', async () => {
    speech.segment(phone, { ...segment(0, 2), pcm: new Int16Array(2 * SAMPLES_PER_SECOND) });
    speech.segment(phone, segment(5000, 0.2));
    speech.finish(phone);
    await settled();
    expect(requests).toHaveLength(0);
  });
});
