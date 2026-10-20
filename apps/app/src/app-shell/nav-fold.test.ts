import { describe, expect, it } from 'vitest';
import { foldKind, type Foldable } from './nav-fold';

function item(key: string, extra: Partial<Foldable> = {}): Foldable {
  return { key, folder: false, parent: null, fixed: false, ...extra };
}

describe('what dropping one navigation item on another does', () => {
  it('creates a folder from two plain top-level items', () => {
    expect(foldKind(item('a'), item('b'))).toBe('create');
  });

  it('joins an existing folder', () => {
    expect(foldKind(item('a'), item('f', { folder: true }))).toBe('join');
  });

  it('refuses a folder inside a folder and an item onto itself', () => {
    expect(foldKind(item('f', { folder: true }), item('b'))).toBe('refuse');
    expect(foldKind(item('f', { folder: true }), item('g', { folder: true }))).toBe('refuse');
    expect(foldKind(item('a'), item('a'))).toBe('refuse');
  });

  it('refuses fixed items on either side', () => {
    expect(foldKind(item('assistant', { fixed: true }), item('b'))).toBe('refuse');
    expect(foldKind(item('a'), item('assistant', { fixed: true }))).toBe('refuse');
  });

  it('refuses a target that already sits inside a folder', () => {
    expect(foldKind(item('a'), item('m', { parent: 'f' }))).toBe('refuse');
  });
});
