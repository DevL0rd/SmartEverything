import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CameraListening } from '../../src/transcripts/camera-listening';
import type { TranscribeRequest } from '../../src/transcripts/transcriber';
import { Transcripts } from '../../src/transcripts/transcript-service';
import type { SpeechSegment } from '../../src/wake-name/ear';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = '2026-10-15T18:00:00.000Z';
const SAMPLES_PER_MS = 16;
const CAMERA = 'living-room-camera';
const HOLD_PAST_MS = 3000;

let test: TestStore;
let clock: FakeClock;
let transcripts: Transcripts;
let said: string[];
let requests: TranscribeRequest[];
let keyPresent: boolean;

function tone(ms: number): Int16Array {
  const amplitude = 32_768 * 10 ** (-15 / 20) * Math.SQRT2;
  return Int16Array.from({ length: ms * SAMPLES_PER_MS }, (_, index) =>
    Math.round(amplitude * Math.sin((2 * Math.PI * 220 * index) / 16_000)),
  );
}

function segment(offsetMs: number, ms: number): SpeechSegment {
  const base = Date.parse(START);
  return { startedAt: base + offsetMs, endedAt: base + offsetMs + ms, pcm: tone(ms) };
}

function listening(): CameraListening {
  return new CameraListening({
    store: test.store,
    transcripts,
    transcriber: {
      transcribe: (request): Promise<string | null> => {
        requests.push(request);
        return Promise.resolve(said.shift() ?? null);
      },
    },
    ready: () => Promise.resolve(),
    keyPresent: () => keyPresent,
    inConversation: () => false,
    names: () => ['Ann'],
    clock,
    log: testLogger('listening'),
  });
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

async function hear(camera: CameraListening, heard: readonly SpeechSegment[]): Promise<void> {
  for (const piece of heard) {
    camera.segment(CAMERA, piece);
  }
  const last = heard.at(-1);
  if (last !== undefined) {
    clock.advanceTo(new Date(last.endedAt + HOLD_PAST_MS).toISOString());
  }
  await settle();
}

function lines(): ReturnType<Transcripts['read']>['lines'] {
  const [session] = transcripts.list({ source: 'camera', sourceId: CAMERA, limit: 5 });
  return session === undefined ? [] : transcripts.read(session.id, 0, 50).lines;
}

beforeEach(async () => {
  test = await testStore();
  clock = new FakeClock(START);
  transcripts = new Transcripts({ store: test.store, clock, log: testLogger('transcripts') });
  said = [];
  requests = [];
  keyPresent = true;
});

afterEach(async () => {
  transcripts.stop();
  await test.close();
});

describe('camera listening timestamps', () => {
  it('writes the line with the start and end of the audio that was heard, labelled wall clock', async () => {
    said = ['Is anyone home'];
    await hear(listening(), [segment(1000, 1200)]);
    expect(lines()).toMatchObject([
      {
        at: new Date(Date.parse(START) + 1000).toISOString(),
        ended_at: new Date(Date.parse(START) + 2200).toISOString(),
        timing: 'wall_clock',
        text: 'Is anyone home',
      },
    ]);
  });

  it('spans a merged utterance from its first piece to its last, not to when it was transcribed', async () => {
    said = ['Turn the lights on please'];
    await hear(listening(), [segment(1000, 900), segment(2300, 900)]);
    expect(requests).toHaveLength(1);
    expect(lines()).toMatchObject([
      {
        at: new Date(Date.parse(START) + 1000).toISOString(),
        ended_at: new Date(Date.parse(START) + 3200).toISOString(),
      },
    ]);
  });

  it('separates utterances that are far apart in time into their own lines', async () => {
    said = ['First thing', 'Second thing'];
    const camera = listening();
    await hear(camera, [segment(1000, 1000)]);
    await hear(camera, [segment(20_000, 1000)]);
    expect(lines().map((line) => line.text)).toEqual(['First thing', 'Second thing']);
  });

  it('writes nothing while no transcription key is present', async () => {
    keyPresent = false;
    said = ['Nobody hears this'];
    await hear(listening(), [segment(1000, 1200)]);
    expect(requests).toHaveLength(0);
    expect(lines()).toEqual([]);
  });

  it('drops the same words said again within half a minute', async () => {
    said = ['Good morning', 'good morning'];
    const camera = listening();
    await hear(camera, [segment(1000, 1000)]);
    await hear(camera, [segment(8000, 1000)]);
    expect(lines()).toHaveLength(1);
  });
});
