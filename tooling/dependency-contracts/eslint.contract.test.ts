import { describe, expect, it } from 'vitest';
import { ESLint, Linter } from 'eslint';
import { ROOT_MANIFEST, declaredVersion } from './contract-helpers';

describe('eslint contract', () => {
  it('reports its version through the api', () => {
    expect(ESLint.version).toBe(declaredVersion(ROOT_MANIFEST, 'eslint'));
  });

  it('flags a violation in flat config mode', () => {
    const linter = new Linter();
    const messages = linter.verify('var x = 1', [{ rules: { 'no-var': 'error' } }]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('no-var');
  });

  it('reports no messages for compliant code', () => {
    const linter = new Linter();
    expect(linter.verify('const x = 1;', [{ rules: { 'no-var': 'error' } }])).toStrictEqual([]);
  });
});
