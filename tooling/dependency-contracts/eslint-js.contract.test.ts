import { describe, expect, it } from 'vitest';
import { itIsPinnedToItsDeclaredVersion } from './contract-helpers';
import js from '@eslint/js';

describe('@eslint/js contract', () => {
  itIsPinnedToItsDeclaredVersion('@eslint/js');

  it('exposes the recommended config the flat config extends', () => {
    expect(js.configs.recommended).toBeDefined();
    expect(js.configs.recommended.rules).toBeDefined();
  });
});
