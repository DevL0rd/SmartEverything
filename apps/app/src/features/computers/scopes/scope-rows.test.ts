import { describe, expect, it } from 'vitest';
import { COMPUTER_SCOPES } from '@smarteverything/domain';
import { SCOPE_ROWS, scopeTitle } from './scope-rows';

describe('scope rows', () => {
  it('has exactly one row for every scope the computer reports', () => {
    expect(SCOPE_ROWS.map((row) => row.scope).sort()).toEqual(
      Object.keys(COMPUTER_SCOPES.shape).sort(),
    );
  });

  it('names a scope by its row title', () => {
    expect(scopeTitle('ai_power')).toBe('Assistant power actions');
  });
});
