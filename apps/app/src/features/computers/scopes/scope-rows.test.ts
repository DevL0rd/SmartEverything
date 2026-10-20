import { describe, expect, it } from 'vitest';
import { COMPUTER_SCOPES, DEFAULT_COMPUTER_SCOPES } from '@smarteverything/domain';
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

  it('offers pointer and keyboard control next to screenshots, off until the owner turns it on', () => {
    const order = SCOPE_ROWS.map((row) => row.scope);
    expect(order.indexOf('input')).toBe(order.indexOf('screenshots') + 1);
    expect(scopeTitle('input')).toBe('Pointer and keyboard');
    expect(DEFAULT_COMPUTER_SCOPES.input).toBe(false);
  });

  it('offers app events next to apps, on until the owner turns them off', () => {
    const order = SCOPE_ROWS.map((row) => row.scope);
    expect(order.indexOf('app_events')).toBe(order.indexOf('apps') + 1);
    expect(scopeTitle('app_events')).toBe('App events');
    expect(DEFAULT_COMPUTER_SCOPES.app_events).toBe(true);
  });
});
