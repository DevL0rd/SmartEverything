import { describe, expect, it } from 'vitest';
import { latestReleaseTag } from './workloads-fixtures.ts';

describe('latestReleaseTag', () => {
  it('picks the highest numeric release and ignores candidates', () => {
    expect(
      latestReleaseTag(['v2.9.0', 'v2.10.1', 'v2.10.0', 'v2.11.0-rc1', 'v2.9.10', 'junk']),
    ).toBe('v2.10.1');
  });

  it('compares each part as a number', () => {
    expect(latestReleaseTag(['v2.9.9', 'v2.10.0'])).toBe('v2.10.0');
  });

  it('fails when no release exists', () => {
    expect(() => latestReleaseTag(['v2.1.0-rc0'])).toThrow();
  });
});
