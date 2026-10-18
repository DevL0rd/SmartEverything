import { describe, expect, it } from 'vitest';
import jsxA11y from 'eslint-plugin-jsx-a11y';

function strictRules(): Readonly<Record<string, unknown>> {
  const strict = jsxA11y.flatConfigs['strict'];
  if (strict === undefined) {
    throw new Error('eslint-plugin-jsx-a11y no longer exposes a strict flat config');
  }
  const { rules } = strict;
  if (rules === undefined) {
    throw new Error('the strict flat config of eslint-plugin-jsx-a11y declares no rules');
  }
  return rules;
}

describe('eslint-plugin-jsx-a11y contract', () => {
  it('exposes the strict flat config the app is linted with', () => {
    expect(Object.keys(strictRules()).length).toBeGreaterThan(0);
  });

  it('includes the rules that caught real defects here', () => {
    expect(strictRules()).toHaveProperty('jsx-a11y/no-autofocus');
    expect(strictRules()).toHaveProperty('jsx-a11y/alt-text');
  });
});
