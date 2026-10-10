import { describe, expect, it } from 'vitest';
import { itIsPinnedToItsDeclaredVersion } from './contract-helpers';
import tseslint from 'typescript-eslint';

describe('typescript-eslint contract', () => {
  itIsPinnedToItsDeclaredVersion('typescript-eslint');

  it('exposes the config helper the flat config uses', () => {
    expect(typeof tseslint.config).toBe('function');
  });

  it('provides the strict and stylistic type checked presets we enable', () => {
    expect(Array.isArray(tseslint.configs.strictTypeChecked)).toBe(true);
    expect(Array.isArray(tseslint.configs.stylisticTypeChecked)).toBe(true);
    expect(tseslint.configs.disableTypeChecked).toBeDefined();
  });
});
