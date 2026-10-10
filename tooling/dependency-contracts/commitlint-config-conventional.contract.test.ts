import { describe, expect, it } from 'vitest';
import conventional from '@commitlint/config-conventional';
import { itIsPinnedToItsDeclaredVersion } from './contract-helpers';

describe('@commitlint/config-conventional contract', () => {
  itIsPinnedToItsDeclaredVersion('@commitlint/config-conventional');

  it('constrains commit type, which trunk based delivery relies on', () => {
    expect(conventional.rules).toHaveProperty('type-enum');
  });

  it('requires a non empty subject', () => {
    expect(conventional.rules).toHaveProperty('subject-empty');
  });
});
