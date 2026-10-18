import { readFileSync } from 'node:fs';
import {
  DEFAULT_PAUSE_MS,
  type PauseChoiceMs,
  type WakeSensitivity,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ear, type SpeechSegment } from '../../src/wake-name/ear';
import { KeywordSpotter } from '../../src/wake-name/keyword-spotter';
import type { WakeGrant } from '../../src/wake-name/wake-claims';
import { sileroModel } from '../../src/assistant-voice/silero-vad';
import { captureLogs } from '../support/logs';

const START = Date.parse('2026-10-18T10:00:00.000Z');
const FRAME = 320;
const SAMPLES_PER_MS = 16;
const PROCESSING_LAG_MS = 700;

function person(): Int16Array {
  const bytes = readFileSync(new URL('../assistant/fixtures/person.pcm', import.meta.url));
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function stream(): Int16Array {
  const speech = person();
  const out = new Int16Array(speech.length + 16_000 * 3);
  out.set(speech, 16_000);
  return out;
}

async function segmentsOf(
  input: Int16Array,
  resting: (at: number) => boolean,
): Promise<SpeechSegment[]> {
  let now = START;
  let fed = 0;
  const segments: SpeechSegment[] = [];
  const ear = new Ear(
    {
      claims: {
        request: (): WakeGrant => ({ granted: false, onSuperseded: (): void => undefined }),
      },
      spotter: new KeywordSpotter(),
      model: sileroModel,
      names: (): string[] => [],
      pauseMs: (): PauseChoiceMs => DEFAULT_PAUSE_MS,
      clock: { now: (): Date => new Date(now), at: (): (() => void) => (): void => undefined },
      log: new Logger('hub.wake-name'),
    },
    {
      claim: { source: 'camera', key: 'living' },
      fields: { cameraId: 'living' },
      sensitivity: (): WakeSensitivity => 'standard',
      resting: (): boolean => resting(fed),
      wake: null,
      speech: (segment): void => {
        segments.push(segment);
      },
    },
  );
  await ear.open();
  for (let offset = 0; offset + FRAME <= input.length; offset += FRAME) {
    now = START + (offset + FRAME) / SAMPLES_PER_MS;
    ear.hear(input.slice(offset, offset + FRAME));
    fed = offset + FRAME;
    await new Promise((resolve) => setImmediate(resolve));
    now += PROCESSING_LAG_MS;
  }
  await ear.close();
  return segments;
}

beforeEach(() => {
  captureLogs();
});

afterEach(() => {
  Logger.reset();
});

describe('speech segments from an ear', () => {
  it('span exactly the audio they carry on the stream timeline', async () => {
    const input = stream();
    const [segment] = await segmentsOf(input, () => false);
    expect(segment).toBeDefined();
    if (segment === undefined) return;
    const offset = Math.round((segment.startedAt - START) * SAMPLES_PER_MS);
    expect(segment.endedAt - segment.startedAt).toBeCloseTo(segment.pcm.length / SAMPLES_PER_MS, 3);
    expect(input.subarray(offset, offset + segment.pcm.length)).toEqual(segment.pcm);
  }, 60_000);

  it('stay aligned after the ear rested through part of the stream', async () => {
    const input = stream();
    const [segment] = await segmentsOf(input, (fed) => fed < 8_000);
    expect(segment).toBeDefined();
    if (segment === undefined) return;
    const offset = Math.round((segment.startedAt - START) * SAMPLES_PER_MS);
    expect(input.subarray(offset, offset + segment.pcm.length)).toEqual(segment.pcm);
  }, 60_000);
});
