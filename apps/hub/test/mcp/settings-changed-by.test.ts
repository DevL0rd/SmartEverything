import { SETTINGS_ROW } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { CHANGED_BY } from '../../src/extensions/mcp/tools/settings';

const DERIVED = new Set([
  'updated_at',
  'public_url_checked_at',
  'public_url_verified_at',
  'public_url_error',
]);

describe('get_settings changed_by', () => {
  it('names the tool or operation that changes every home setting the AI can read', () => {
    const unnamed = Object.keys(SETTINGS_ROW.shape).filter(
      (key) => !DERIVED.has(key) && !Object.hasOwn(CHANGED_BY, key),
    );
    expect(unnamed).toEqual([]);
  });

  it('names only things that exist as settings or as the per-person parts get_settings returns', () => {
    const known = new Set([
      ...Object.keys(SETTINGS_ROW.shape),
      'push',
      'goals',
      'preferences',
      'layouts',
      'rooms',
      'people',
      'devices',
      'cameras',
    ]);
    expect(Object.keys(CHANGED_BY).filter((key) => !known.has(key))).toEqual([]);
  });
});
