import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TONE_ROLE, TONE_TEXT } from './tone';

describe('tone', () => {
  it('maps the inverse tone to the page background for text on an on-surface fill', () => {
    expect(TONE_TEXT.inverse).toBe('text-bg');
    expect(TONE_ROLE.inverse).toBe('bg');
  });

  it('gives every tone a distinct text class', () => {
    const classes = Object.values(TONE_TEXT);
    expect(new Set(classes).size).toBe(classes.length);
  });

  it('colours the tooltip text through the tone, not a competing class', () => {
    const source = readFileSync(new URL('./tooltip.tsx', import.meta.url), 'utf8');
    expect(source).toContain('tone="inverse"');
    expect(source).not.toMatch(/className="text-/);
  });
});
