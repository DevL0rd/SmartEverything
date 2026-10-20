import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EarEngine, EarEngineError, wakeEarEngine } from '../../../src/node/ear/ear-engine';
import { captureLogs } from '../../support/logs';
import type { KeywordEngine } from '../../../src/node/ear/relayed-spotter';
import { earRig, SpeakingModel } from './ear-fakes';

beforeEach(() => {
  captureLogs();
});

afterEach(() => {
  Logger.reset();
});

describe('ear engine loading', () => {
  it('loads the real wake spotter and speech model and frees what it probed', async () => {
    const engine = wakeEarEngine();
    await expect(engine.load()).resolves.toBeUndefined();
  }, 30_000);

  it('probes once and shares the result with every host', async () => {
    const fakes = earRig();
    await Promise.all([fakes.engine.load(), fakes.engine.load()]);
    await fakes.engine.load();
    expect(fakes.models).toHaveLength(1);
    expect(fakes.models[0]?.released).toBe(1);
    expect(fakes.keywords.listens).toHaveLength(1);
  });

  it('names a spotter that builds no keywords and probes again next time', async () => {
    const fakes = earRig();
    fakes.keywords.buildsNoKeywords = true;
    await expect(fakes.engine.load()).rejects.toBeInstanceOf(EarEngineError);
    expect(fakes.models).toEqual([]);
    fakes.keywords.buildsNoKeywords = false;
    await expect(fakes.engine.load()).resolves.toBeUndefined();
  });

  it('fails loudly when the speech model cannot load and probes again next time', async () => {
    const fakes = earRig();
    let failing = true;
    const engine = new EarEngine({
      spotter: (): KeywordEngine => fakes.keywords,
      model: (): Promise<Model> =>
        failing
          ? Promise.reject(new Error('no speech model'))
          : Promise.resolve(new SpeakingModel()),
    });
    await expect(engine.load()).rejects.toThrow('no speech model');
    failing = false;
    await expect(engine.load()).resolves.toBeUndefined();
  });
});
