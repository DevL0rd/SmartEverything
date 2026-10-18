import { describe, expect, it } from 'vitest';
import { ripplesFor } from './button-ripple';

const AT = '2026-10-18T10:00:00.000Z';

describe('press ripples', () => {
  it('stays still for the press already shown when the visual appeared', () => {
    expect(ripplesFor({ seen: AT, at: AT, gesture: 'single', playing: true })).toEqual([]);
  });

  it('plays one ring for a press, two for a double and a slow one for a hold', () => {
    const fresh = { seen: null, at: AT, playing: true } as const;
    expect(ripplesFor({ ...fresh, gesture: 'single' }).map((ripple) => ripple.key)).toEqual([
      `${AT}-0`,
    ]);
    expect(ripplesFor({ ...fresh, gesture: 'double' })).toHaveLength(2);
    const [hold] = ripplesFor({ ...fresh, gesture: 'long' });
    const [press] = ripplesFor({ ...fresh, gesture: 'single' });
    expect((hold?.ms ?? 0) > (press?.ms ?? 0)).toBe(true);
  });

  it('stays still while the visual is off screen or idle', () => {
    expect(ripplesFor({ seen: null, at: AT, gesture: 'single', playing: false })).toEqual([]);
  });

  it('stays still before any press', () => {
    expect(ripplesFor({ seen: null, at: null, gesture: null, playing: true })).toEqual([]);
  });
});
