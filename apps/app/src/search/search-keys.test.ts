import { describe, expect, it, vi } from 'vitest';
import type { KeyPress } from '../design/keyboard';
import { handleSearchKey } from './search-keys';

function key(name: string, options: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress {
  return { key: name, command: false, alt: false, shift: false, typing: true, ...options };
}

function actions(): {
  readonly open: ReturnType<typeof vi.fn<() => boolean>>;
  readonly runInline: ReturnType<typeof vi.fn<() => boolean>>;
  readonly close: ReturnType<typeof vi.fn<() => void>>;
  readonly seeAll: ReturnType<typeof vi.fn<() => void>>;
  readonly pin: ReturnType<typeof vi.fn<() => boolean>>;
  readonly step: ReturnType<typeof vi.fn<(delta: number) => void>>;
  readonly right: ReturnType<typeof vi.fn<() => boolean>>;
  readonly left: ReturnType<typeof vi.fn<() => boolean>>;
} {
  return {
    open: vi.fn(() => true),
    runInline: vi.fn(() => true),
    close: vi.fn<() => void>(),
    seeAll: vi.fn<() => void>(),
    pin: vi.fn(() => true),
    step: vi.fn<(delta: number) => void>(),
    right: vi.fn(() => true),
    left: vi.fn(() => true),
  };
}

describe('Search keyboard shortcuts', () => {
  it('lets a focused button handle Enter instead of opening the cursor result', () => {
    const search = actions();
    expect(handleSearchKey(key('Enter', { typing: false }), true, search)).toBe(false);
    expect(search.open).not.toHaveBeenCalled();
    expect(handleSearchKey(key('Enter'), true, search)).toBe(true);
    expect(search.open).toHaveBeenCalledOnce();
  });

  it('leaves Tab and Shift+Tab for focus navigation and runs inline actions with Alt+Enter', () => {
    const search = actions();
    expect(handleSearchKey(key('Tab'), true, search)).toBe(false);
    expect(handleSearchKey(key('Tab', { shift: true }), true, search)).toBe(false);
    expect(search.runInline).not.toHaveBeenCalled();
    expect(handleSearchKey(key('Enter', { alt: true }), true, search)).toBe(true);
    expect(search.runInline).toHaveBeenCalledOnce();
    expect(search.open).not.toHaveBeenCalled();
  });

  it('does not open, run or pin a result from the previous query while the new one settles', () => {
    const search = actions();
    expect(handleSearchKey(key('Enter'), false, search)).toBe(false);
    expect(handleSearchKey(key('Enter', { alt: true }), false, search)).toBe(false);
    expect(handleSearchKey(key('p', { command: true }), false, search)).toBe(false);
    expect(search.open).not.toHaveBeenCalled();
    expect(search.runInline).not.toHaveBeenCalled();
    expect(search.pin).not.toHaveBeenCalled();
    expect(handleSearchKey(key('Enter', { command: true }), false, search)).toBe(true);
    expect(search.seeAll).toHaveBeenCalledOnce();
  });

  it('moves the result cursor from the search field and closes search from a focused control', () => {
    const search = actions();
    expect(handleSearchKey(key('ArrowDown'), true, search)).toBe(true);
    expect(search.step).toHaveBeenCalledWith(1);
    expect(handleSearchKey(key('Escape', { typing: false }), true, search)).toBe(true);
    expect(search.close).toHaveBeenCalledOnce();
  });
});
