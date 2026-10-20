import { describe, expect, it } from 'vitest';
import {
  HARNESS_PLATFORM,
  HARNESS_SANDBOX_ENFORCEMENT,
  UnsupportedHarnessPlatformError,
  harnessPlatform,
} from '../src/harness-platform';

describe('harnessPlatform', () => {
  it('maps the Node platform names to the harness platform names', () => {
    expect(harnessPlatform('linux')).toBe('linux');
    expect(harnessPlatform('darwin')).toBe('macos');
    expect(harnessPlatform('win32')).toBe('windows');
  });

  it('throws a named error that carries the received value for any other platform', () => {
    expect(() => harnessPlatform('freebsd')).toThrow(UnsupportedHarnessPlatformError);
    expect(() => harnessPlatform('freebsd')).toThrow(
      'No harness runs on the platform "freebsd"; expected linux, darwin or win32.',
    );
    expect(() => harnessPlatform('')).toThrow('the platform ""');
  });

  it('names the error class so logs can tell it apart', () => {
    expect(new UnsupportedHarnessPlatformError('aix').name).toBe('UnsupportedHarnessPlatformError');
  });

  it('accepts exactly the harness platform and enforcement names', () => {
    expect(HARNESS_PLATFORM.options).toStrictEqual(['linux', 'macos', 'windows']);
    expect(HARNESS_SANDBOX_ENFORCEMENT.options).toStrictEqual(['full', 'partial']);
    expect(HARNESS_PLATFORM.safeParse('darwin').success).toBe(false);
  });
});
