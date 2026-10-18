import { describe, expect, it } from 'vitest';
import reactHooks from 'eslint-plugin-react-hooks';

describe('eslint-plugin-react-hooks contract', () => {
  it('exposes the recommended config the app is linted with', () => {
    expect(reactHooks.configs.recommended).toBeDefined();
  });

  it('enforces the rules of hooks, which the React Compiler depends on', () => {
    const { rules } = reactHooks.configs.recommended;
    expect(rules).toHaveProperty('react-hooks/rules-of-hooks');
    expect(rules).toHaveProperty('react-hooks/exhaustive-deps');
  });
});
