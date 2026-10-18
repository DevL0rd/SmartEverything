import { describe, expect, it } from 'vitest';
import { ENGINE } from '@smarteverything/domain';
import { nativeModelKey } from '../../provider/computer-engine';
import { RECENT_MAX, recentIdOf, recentIdOfEngine, withRecent } from './panel-recent';

describe('the recent models list', () => {
  it('puts the newest pick first and drops its earlier place', () => {
    expect(withRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('keeps only the last picks', () => {
    const full = Array.from({ length: RECENT_MAX }, (_, index) => `m${String(index)}`);
    const next = withRecent(full, 'new');
    expect(next).toHaveLength(RECENT_MAX);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`m${String(RECENT_MAX - 1)}`);
  });

  it('identifies a computer model by its native key and any other by its id', () => {
    const native = ENGINE.parse({
      kind: 'claude',
      model: 'sonnet',
      device_id: '0b3f4c1e-5d7a-4e0b-9a41-6a6d2f0c8a11',
    });
    expect(recentIdOf({ model: 'sonnet', effort: null, engine: native })).toBe(
      nativeModelKey('claude', 'sonnet'),
    );
    expect(recentIdOf({ model: 'openai/gpt-5', effort: null })).toBe('openai/gpt-5');
  });

  it('identifies an engine chosen in the library the same way as a panel pick', () => {
    const native = ENGINE.parse({
      kind: 'claude',
      model: 'sonnet',
      device_id: '0b3f4c1e-5d7a-4e0b-9a41-6a6d2f0c8a11',
    });
    expect(recentIdOfEngine(native)).toBe(nativeModelKey('claude', 'sonnet'));
    expect(recentIdOfEngine(ENGINE.parse({ kind: 'openrouter', model: 'openai/gpt-5' }))).toBe(
      'openai/gpt-5',
    );
  });
});
