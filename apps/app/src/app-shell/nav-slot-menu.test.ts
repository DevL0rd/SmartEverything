import { describe, expect, it, vi } from 'vitest';
import type { NavNodeView, NavPinEntry, NavSectionEntry } from './nav-model';
import { slotMenuItems, type SlotMenuContext } from './nav-slot-menu';

const section = (name: 'home' | 'assistant' | 'devices'): NavSectionEntry => ({
  kind: 'section',
  key: `section:${name}`,
  node: { kind: 'section', key: `section:${name}`, section: name },
  title: name,
  shortTitle: name,
  icon: 'home',
  active: false,
  badge: null,
  count: 0,
  missing: false,
  href: '/',
  tab: name,
});

const pin: NavPinEntry = {
  kind: 'pin',
  key: 'pin1',
  node: {
    kind: 'pin',
    key: 'pin1',
    missing: false,
    pin: {
      kind: 'pin',
      id: 'pin1',
      target: { kind: 'section', section: 'home' },
      title: null,
      icon: null,
    },
  },
  title: 'Pin',
  shortTitle: 'Pin',
  icon: 'star',
  active: false,
  badge: null,
  count: 0,
  missing: false,
  href: null,
  tab: null,
};

function context(overflow: readonly NavNodeView[]): SlotMenuContext & {
  readonly place: ReturnType<typeof vi.fn>;
  readonly remove: ReturnType<typeof vi.fn>;
  readonly hide: ReturnType<typeof vi.fn>;
  readonly openEditor: ReturnType<typeof vi.fn>;
} {
  const place = vi.fn();
  const remove = vi.fn();
  const hide = vi.fn();
  const ungroup = vi.fn();
  const openEditor = vi.fn();
  return { overflow, edits: { place, remove, hide, ungroup }, openEditor, place, remove, hide };
}

const labels = (items: readonly { readonly label: string }[]): readonly string[] =>
  items.map((item) => item.label);

describe('bar slot menu', () => {
  it('offers removal from the bar and hiding for a page', () => {
    const items = slotMenuItems(section('devices'), context([pin]));
    expect(labels(items)).toEqual(['Remove from bar', 'Hide page']);
  });

  it('offers renaming, a new icon, and unpinning for a pin and no hiding', () => {
    const ctx = context([pin]);
    const items = slotMenuItems(pin, ctx);
    expect(labels(items)).toEqual(['Rename', 'Change icon', 'Remove from bar', 'Unpin']);
    items[0]?.onPress();
    expect(ctx.openEditor).toHaveBeenCalledWith({ kind: 'rename', key: 'pin1' });
    items[3]?.onPress();
    expect(ctx.remove).toHaveBeenCalledWith('pin1');
  });

  it('cannot remove from the bar when nothing sits below it', () => {
    expect(labels(slotMenuItems(section('home'), context([])))).toEqual(['Hide page']);
  });

  it('places the node after the first node below the bar', () => {
    const ctx = context([pin, section('devices')]);
    slotMenuItems(section('home'), ctx)[0]?.onPress();
    expect(ctx.place).toHaveBeenCalledWith('section:home', {
      parent: null,
      before: 'section:devices',
    });
  });

  it('places the node at the end when only one node is below the bar', () => {
    const ctx = context([pin]);
    slotMenuItems(section('home'), ctx)[0]?.onPress();
    expect(ctx.place).toHaveBeenCalledWith('section:home', { parent: null, before: null });
  });

  it('offers nothing for the assistant', () => {
    expect(labels(slotMenuItems(section('assistant'), context([])))).toEqual([]);
  });

  it('hides a page through the edit', () => {
    const ctx = context([]);
    slotMenuItems(section('devices'), ctx)[0]?.onPress();
    expect(ctx.hide).toHaveBeenCalledWith('devices');
  });
});
