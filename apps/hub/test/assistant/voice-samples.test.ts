import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError, NO_PRICES } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VoiceSamples } from '../../src/assistant-voice/voice-samples';
import type {
  VoiceSampleProvider,
  VoiceSampleRequest,
} from '../../src/assistant-voice/gemini-preview';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const LISTENER = { clientId: 'client', profileId: 'profile' } as const;
const WAV = Buffer.from('RIFF-sample');

let opened: TestStore;
let directory: string;

beforeEach(async () => {
  opened = await testStore();
  directory = await mkdtemp(join(tmpdir(), 'voice-samples-'));
});

afterEach(async () => {
  await opened.close();
  await rm(directory, { recursive: true, force: true });
});

function samples(
  key: () => string | null,
  requests: VoiceSampleRequest[],
  refusal: string | null = null,
): VoiceSamples {
  const provider: VoiceSampleProvider = {
    sample: (request): Promise<Buffer> => {
      requests.push(request);
      return Promise.resolve(WAV);
    },
  };
  const made = new VoiceSamples({
    provider,
    store: opened.store,
    prices: { priceOf: (): typeof NO_PRICES => NO_PRICES },
    log: testLogger('voice-samples'),
    key,
    directory,
  });
  made.attachBudget(() => refusal);
  return made;
}

async function failureOf(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('voice samples', () => {
  it('tells the caller where to add the Gemini key instead of failing the request', async () => {
    const requests: VoiceSampleRequest[] = [];
    const failure = await failureOf(samples(() => null, requests).sample(LISTENER, 'Zephyr'));
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      code: 'forbidden',
      message: 'Add a Gemini key in Assistant settings › Voice calls to play voice samples.',
    });
    expect(requests).toStrictEqual([]);
  });

  it('refuses to generate a sample once the budget is spent', async () => {
    const requests: VoiceSampleRequest[] = [];
    const failure = await failureOf(
      samples(() => 'key', requests, 'Budget reached.').sample(LISTENER, 'Zephyr'),
    );
    expect(failure).toMatchObject({ code: 'forbidden', message: 'Budget reached.' });
    expect(requests).toStrictEqual([]);
  });

  it('generates a voice once and plays it from disk afterwards, even without a key', async () => {
    const requests: VoiceSampleRequest[] = [];
    const first = await samples(() => 'key', requests).sample(LISTENER, 'Zephyr');
    const again = await samples(() => null, requests).sample(LISTENER, 'Zephyr');
    expect(first).toStrictEqual({ audio: WAV.toString('base64') });
    expect(again).toStrictEqual(first);
    expect(requests).toHaveLength(1);
    expect(await readdir(directory)).toHaveLength(1);
  });

  it('keeps one sample per voice', async () => {
    const requests: VoiceSampleRequest[] = [];
    const made = samples(() => 'key', requests);
    await made.sample(LISTENER, 'Zephyr');
    await made.sample(LISTENER, 'Puck');
    expect(requests.map((request) => request.voice)).toStrictEqual(['Zephyr', 'Puck']);
    expect(await readdir(directory)).toHaveLength(2);
  });

  it('hands the request abort signal to the provider', async () => {
    const requests: VoiceSampleRequest[] = [];
    const control = new AbortController();
    await samples(() => 'key', requests).sample(LISTENER, 'Zephyr', control.signal);
    expect(requests[0]?.signal).toBe(control.signal);
  });
});
