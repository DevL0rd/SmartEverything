import {
  DEFAULT_DESKTOP_DRIVE_TUNING,
  type DesktopDriveTuningLimits,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  HELPER_LIMITS_LINE,
  TuningBoundError,
  TuningLimitsMissingError,
  limitsOf,
  validateTuning,
} from '../../src/drive-mount/helper-tuning-report.js';

const LIMITS: DesktopDriveTuningLimits = {
  platform: 'linux',
  pageBytes: 4096,
  maxUserBackground: 20_793,
  maxUserCongestionThreshold: 15_594,
  maxRequestBytes: 1_048_576,
  kernelReadaheadOfferBytes: 131_072,
};

function check(change: Partial<typeof DEFAULT_DESKTOP_DRIVE_TUNING>): () => void {
  return () => {
    validateTuning({ ...DEFAULT_DESKTOP_DRIVE_TUNING, ...change }, LIMITS);
  };
}

describe('tuning bounds', () => {
  it('accepts the defaults and any value inside the reported limits', () => {
    expect(check({})).not.toThrow();
    expect(check({ maxBackground: 20_793, congestionThreshold: 15_594 })).not.toThrow();
  });

  it('names the real bound of every field it refuses', () => {
    expect(check({ maxBackground: 20_794 })).toThrow(
      'maxBackground must be at most 20793 (the kernel allows up to 20793 here)',
    );
    expect(check({ maxBackground: 64, congestionThreshold: 65 })).toThrow(
      'congestionThreshold must be at most 64',
    );
    expect(check({ maxRequestBytes: 2_000_000 })).toThrow(TuningBoundError);
    expect(check({ maxRequestBytes: 100 })).toThrow('maxRequestBytes must be at least 4096');
    expect(check({ kernelReadaheadBytes: 262_144 })).toThrow(
      'kernelReadaheadBytes must be at most 131072',
    );
  });

  it('skips the check until the helper has reported its limits', () => {
    expect(() => {
      validateTuning({ ...DEFAULT_DESKTOP_DRIVE_TUNING, maxRequestBytes: 2_000_000 }, null);
    }).not.toThrow();
  });
});

describe('helper limits report', () => {
  it('reports no kernel limits on Windows', () => {
    const line = HELPER_LIMITS_LINE.parse({ type: 'limits', platform: 'windows', kernel: false });
    expect(limitsOf(line)).toEqual({
      platform: 'windows',
      pageBytes: null,
      maxUserBackground: null,
      maxUserCongestionThreshold: null,
      maxRequestBytes: 1_048_576,
      kernelReadaheadOfferBytes: null,
    });
  });

  it('refuses a kernel report that lacks a limit', () => {
    const line = HELPER_LIMITS_LINE.parse({ type: 'limits', platform: 'linux', kernel: true });
    expect(() => limitsOf(line)).toThrow(TuningLimitsMissingError);
  });

  it('has no offer until the first mount reports it', () => {
    const line = HELPER_LIMITS_LINE.parse({
      type: 'limits',
      platform: 'linux',
      kernel: true,
      maxUserBgreq: 100,
      maxUserCongThresh: 75,
      maxPagesLimit: 256,
      pageSize: 4096,
      maxRequestBytes: 1_048_576,
    });
    expect(limitsOf(line).kernelReadaheadOfferBytes).toBeNull();
  });
});
