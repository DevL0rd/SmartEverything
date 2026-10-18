import { describe, expect, it } from 'vitest';
import {
  SIGHT_MEMORY_MAX_SECONDS,
  SIGHT_MEMORY_MIN_SECONDS,
  SIGHT_MEMORY_SECONDS,
  SIGHT_SAMPLING,
  SIGHT_SOURCES,
  SIGHT_TARGET,
  SIGHT_TOKENS_PER_FRAME,
  isCameraSight,
  sightEstimate,
  sightKindOf,
} from '../src/call-sight';

describe('what a sight source is', () => {
  it('groups the sources into cameras, screens and windows', () => {
    expect(SIGHT_SOURCES.map(sightKindOf)).toEqual([
      'camera',
      'camera',
      'screen',
      'screen',
      'window',
    ]);
  });

  it('calls only the two cameras cameras', () => {
    expect(SIGHT_SOURCES.filter(isCameraSight)).toEqual(['home_camera', 'phone_camera']);
  });

  it('samples every source and never faster than once a second', () => {
    for (const source of SIGHT_SOURCES) {
      expect(SIGHT_SAMPLING[source].minIntervalMs).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe('sight memory and targets', () => {
  it('keeps memory between the shortest and the longest allowed', () => {
    expect(SIGHT_MEMORY_SECONDS.safeParse(SIGHT_MEMORY_MIN_SECONDS).success).toBe(true);
    expect(SIGHT_MEMORY_SECONDS.safeParse(SIGHT_MEMORY_MAX_SECONDS).success).toBe(true);
    expect(SIGHT_MEMORY_SECONDS.safeParse(SIGHT_MEMORY_MIN_SECONDS - 1).success).toBe(false);
    expect(SIGHT_MEMORY_SECONDS.safeParse(SIGHT_MEMORY_MAX_SECONDS + 1).success).toBe(false);
  });

  it('trims a target and refuses an empty or very long one', () => {
    expect(SIGHT_TARGET.parse('  Terminal  ')).toBe('Terminal');
    expect(SIGHT_TARGET.safeParse('   ').success).toBe(false);
    expect(SIGHT_TARGET.safeParse('x'.repeat(241)).success).toBe(false);
  });
});

describe('what looking costs', () => {
  const base = { memorySeconds: 15, resolution: 'low', dollarsPerMtok: 1 } as const;

  it('streams a minute of frames and re-reads the memory four times a minute while live', () => {
    const live = sightEstimate({ ...base, mode: 'live' });
    const perFrame = SIGHT_TOKENS_PER_FRAME.low;
    expect(live.memoryTokens).toBe(15 * perFrame);
    expect(live.tokensPerMinute).toBe(60 * perFrame + 4 * 15 * perFrame);
  });

  it('costs nothing per minute on demand, only per still', () => {
    const onDemand = sightEstimate({ ...base, mode: 'on_demand' });
    expect(onDemand.tokensPerMinute).toBe(0);
    expect(onDemand.centsPerMinute).toBe(0);
    expect(onDemand.tokensPerStill).toBe(Math.round(258 * (1 + (4 * 15) / 60)));
    expect(onDemand.centsPerStill).toBeGreaterThan(0);
  });

  it('turns tokens into cents at the given price per million tokens', () => {
    const cheap = sightEstimate({ ...base, mode: 'live', dollarsPerMtok: 1 });
    const dear = sightEstimate({ ...base, mode: 'live', dollarsPerMtok: 2 });
    expect(dear.centsPerMinute).toBeCloseTo(cheap.centsPerMinute * 2);
    expect(cheap.centsPerMinute).toBeCloseTo((cheap.tokensPerMinute / 1_000_000) * 100);
  });

  it('costs more for a medium picture than a low one', () => {
    const low = sightEstimate({ ...base, mode: 'live', resolution: 'low' });
    const medium = sightEstimate({ ...base, mode: 'live', resolution: 'medium' });
    expect(medium.tokensPerMinute).toBeGreaterThan(low.tokensPerMinute);
  });
});
