import { HUB_STARTUP_DEADLINE_MS } from '@smarteverything/domain';
import { expect, it } from 'vitest';

const MEASURED_RESTARTS_MS = [
  15_660, 15_550, 13_740, 12_980, 18_630, 10_840, 39_850, 16_850, 13_900, 12_170, 13_010, 14_120,
  12_160, 13_340, 13_250, 25_010, 13_970, 20_640, 13_690, 21_910, 18_870, 13_750, 19_090, 14_120,
  33_500, 22_620, 14_230, 11_520, 11_550, 9_090, 29_800, 9_640, 10_000,
] as const;

const MEASURED_STARTUPS_MS = [
  5_530, 5_520, 5_500, 3_440, 3_110, 2_940, 2_720, 2_930, 8_480, 3_690, 3_550, 4_250, 3_970, 3_500,
  4_720, 3_290, 5_100, 3_560, 9_230, 3_540, 3_870, 4_160, 3_370, 8_940, 4_480, 6_850, 11_090, 2_440,
  2_500, 2_650, 2_060, 5_290, 2_250, 2_320, 3_540, 5_710, 22_290, 22_830,
] as const;

const RELEASE_HEADROOM = 3;

it('waits three times the slowest restart measured on the live hub, rounded up to 10 s', () => {
  const slowest = Math.max(...MEASURED_RESTARTS_MS);
  expect(slowest).toBe(39_850);
  expect(Math.ceil((RELEASE_HEADROOM * slowest) / 10_000) * 10_000).toBe(HUB_STARTUP_DEADLINE_MS);
});

it('covers every measured start-up from the starting log line to service.started', () => {
  expect(Math.max(...MEASURED_STARTUPS_MS)).toBeLessThan(HUB_STARTUP_DEADLINE_MS);
  expect(Math.max(...MEASURED_RESTARTS_MS)).toBeLessThan(HUB_STARTUP_DEADLINE_MS);
});
