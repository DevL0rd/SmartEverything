import { describe, expect, it } from 'vitest';
import { ENGINE } from '@smarteverything/domain';
import { nativeModelKey } from '../../provider/computer-engine';
import { RECENT_MAX, recentIdOf, withRecent } from './panel-recent';

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

  it('identifies a metered engine chosen in the library by model id', () => {
    const metered = ENGINE.parse({
      kind: 'dsh',
      execution_target: { kind: 'server' },
      session_id: null,
      model_route_id: '0e000000-0000-4000-8000-0000000000a1',
      model: 'openai/gpt-5',
    });
    expect(recentIdOf({ model: metered.model, effort: null, engine: metered })).toBe(
      'openai/gpt-5',
    );
  });
});
