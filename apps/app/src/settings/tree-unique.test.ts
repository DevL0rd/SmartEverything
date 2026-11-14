import { describe, expect, it } from 'vitest';

const { SETTINGS_TREE } = await import('./tree');

function repeated(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const again = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) again.add(value);
    seen.add(value);
  }
  return [...again];
}

describe('the settings tree', () => {
  it('defines every page id once', () => {
    expect(repeated(SETTINGS_TREE.map((page) => page.id))).toEqual([]);
  });

  it('gives every top-level page a title no other top-level page has', () => {
    const top = SETTINGS_TREE.filter((page) => page.parent === null);
    expect(repeated(top.map((page) => page.title))).toEqual([]);
  });

  it('keeps each page title unique among the pages of one parent', () => {
    const siblings = SETTINGS_TREE.map((page) => `${page.parent ?? ''}\u0000${page.title}`);
    expect(repeated(siblings)).toEqual([]);
  });
});
