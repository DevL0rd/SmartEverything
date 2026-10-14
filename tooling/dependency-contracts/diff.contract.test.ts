import { describe, expect, it } from 'vitest';
import { diffLines } from 'diff';
import { appDeclaredVersion } from './app-manifest';
import { installedVersion } from './versions';

describe('diff contract', () => {
  it('matches the exact app dependency version', () => {
    expect(installedVersion('diff')).toBe(appDeclaredVersion('diff'));
  });
  it('keeps distinct edits separated by their unchanged lines', () => {
    expect(
      diffLines('old\nkeep\nlast\n', 'new\nkeep\nfinal\n').map((part) => [
        part.added,
        part.removed,
        part.value,
      ]),
    ).toEqual([
      [false, true, 'old\n'],
      [true, false, 'new\n'],
      [false, false, 'keep\n'],
      [false, true, 'last\n'],
      [true, false, 'final\n'],
    ]);
  });
  it('returns an explicit incomplete result when the requested edit bound is exceeded', () => {
    expect(diffLines('a\nb\n', 'c\nd\n', { maxEditLength: 1 })).toBeUndefined();
  });
});
