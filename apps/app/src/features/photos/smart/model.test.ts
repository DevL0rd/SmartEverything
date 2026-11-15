import type { PhotoAiStatus } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { percent } from '../../../format/number';
import {
  donePercent,
  failedTotalOf,
  modelOptionsOf,
  smartLinkOf,
  smartPhaseOf,
  spendOf,
  stageLineOf,
  stageRingsOf,
} from './model';

const EMPTY = { done: 0, queued: 0, failed: 0, needsKey: 0 };

function status(patch: Partial<PhotoAiStatus> = {}): PhotoAiStatus {
  return {
    smartSearch: true,
    faceGrouping: true,
    hasKey: true,
    total: 100,
    faces: { ...EMPTY, done: 100 },
    tags: { ...EMPTY, done: 100 },
    index: { ...EMPTY, done: 100 },
    spentMicros: 80_000,
    estimateMicros: 0,
    models: { vision: 'v', embedding: 'e', petEmbedding: 'p', eraser: 'x' },
    ...patch,
  };
}

describe('the smart features progress', () => {
  it('shows a ring per switched on stage with done over total', () => {
    const rings = stageRingsOf(status({ tags: { done: 30, queued: 60, failed: 10, needsKey: 0 } }));
    expect(rings.map((ring) => [ring.stage, ring.done, ring.total, ring.progress])).toEqual([
      ['faces', 100, 100, 1],
      ['tags', 30, 100, 0.3],
      ['index', 100, 100, 1],
    ]);
    expect(stageRingsOf(status({ smartSearch: false })).map((ring) => ring.stage)).toEqual([
      'faces',
    ]);
    expect(stageRingsOf(status({ faceGrouping: false })).map((ring) => ring.stage)).toEqual([
      'tags',
      'index',
    ]);
  });

  it('never reads 100 % while photos failed or wait, and marks the failed share', () => {
    expect(donePercent(48_100, 48_213)).toBe(percent(0.99));
    expect(donePercent(48_213, 48_213)).toBe(percent(1));
    expect(donePercent(0, 0)).toBe(percent(0));
    const [faces] = stageRingsOf(status({ faces: { ...EMPTY, done: 48_100, failed: 113 } }));
    expect(faces?.label).toBe(percent(0.99));
    expect(faces?.failedShare).toBeCloseTo(113 / 48_213);
    expect(stageRingsOf(status())[0]).toMatchObject({ label: percent(1), failedShare: 0 });
    expect(smartLinkOf(status({ tags: { ...EMPTY, done: 999, failed: 1 } })).headline).toBe(
      `${percent(0.99)} analysed`,
    );
  });

  it('says what is left on each stage', () => {
    expect(stageLineOf({ done: 1, queued: 2, failed: 3, needsKey: 4 })).toBe(
      '2 waiting · 3 failed · 4 need a key',
    );
    expect(stageLineOf(EMPTY)).toBe('Nothing to do yet');
    expect(stageLineOf({ ...EMPTY, done: 5 })).toBe('Up to date');
  });

  it('tells off, no key, running, failed and done apart', () => {
    expect(smartPhaseOf(status({ smartSearch: false, faceGrouping: false }))).toBe('off');
    expect(smartPhaseOf(status({ hasKey: false }))).toBe('no-key');
    expect(smartPhaseOf(status({ hasKey: false, smartSearch: false }))).toBe('done');
    expect(smartPhaseOf(status({ faces: { ...EMPTY, queued: 1 } }))).toBe('running');
    const failed = status({ index: { ...EMPTY, failed: 2 }, faces: { ...EMPTY, failed: 1 } });
    expect(smartPhaseOf(failed)).toBe('failed');
    expect(failedTotalOf(failed)).toBe(3);
    expect(smartPhaseOf(status())).toBe('done');
  });

  it('draws the spend against the spend plus the estimate', () => {
    expect(spendOf(status({ spentMicros: 25, estimateMicros: 75 }))).toEqual({
      spent: 25,
      planned: 100,
      progress: 0.25,
    });
    expect(spendOf(status({ spentMicros: 0 })).progress).toBe(0);
  });

  it('summarises the state on the Photos settings card', () => {
    expect(smartLinkOf(status({ smartSearch: false, faceGrouping: false }))).toEqual({
      headline: 'Off',
      detail: 'Turn on face grouping or smart search',
      progress: null,
    });
    const running = smartLinkOf(status({ tags: { ...EMPTY, done: 50, queued: 50 } }));
    expect(running.detail).toBe('Analysing on your home hub');
    expect(running.progress).toBeCloseTo(250 / 300);
    expect(smartLinkOf(status()).headline).toBe(`${percent(1)} analysed`);
  });

  it('offers the listed models with their maker and price, and keeps the one in use', () => {
    const cost = (micros: number): string => `USD ${String(micros / 1_000_000)}`;
    const gemini = {
      id: 'google/gemini',
      name: 'Gemini',
      author: 'Google',
      contextLength: 1_000_000,
      inputPerMtok: 0.3,
    };
    const varied = { ...gemini, id: 'x/varied', name: 'Varied', author: 'X', inputPerMtok: null };
    expect(modelOptionsOf([gemini, varied], 'google/gemini', cost)).toEqual([
      {
        value: 'google/gemini',
        label: 'Gemini',
        description: 'Google · USD 0.3 per million tokens in',
      },
      { value: 'x/varied', label: 'Varied', description: 'X · Price varies' },
    ]);
    expect(modelOptionsOf([gemini], 'old/model', cost)[0]).toEqual({
      value: 'old/model',
      label: 'old/model',
      description: 'In use, no longer offered with no data kept',
    });
  });
});
