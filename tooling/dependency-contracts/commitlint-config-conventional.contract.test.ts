import { describe, expect, it } from 'vitest';
import conventional from '@commitlint/config-conventional';

describe('@commitlint/config-conventional contract', () => {
  it('constrains commit type, which trunk based delivery relies on', () => {
    expect(conventional.rules).toHaveProperty('type-enum');
  });

  it('requires a non empty subject', () => {
    expect(conventional.rules).toHaveProperty('subject-empty');
  });
});
