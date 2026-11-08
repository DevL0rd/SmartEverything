import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DeletedItem } from './model';
import type { SelectionHeaderProps } from './selection-header';

interface ButtonProps {
  readonly label: string;
  readonly variant?: string;
  readonly disabled?: boolean;
}

vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('span', {}, children),
}));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/button', () => ({
  Button: ({ label, variant, disabled }: ButtonProps): ReactNode =>
    createElement(
      'button',
      { 'data-variant': variant ?? 'filled', 'data-off': disabled === true ? 'yes' : 'no' },
      label,
    ),
}));
vi.mock('../../../components/menu', () => ({ useContextMenu: (): null => null }));
vi.mock('../../../components/files/file-glyph', () => ({ FileGlyph: (): null => null }));

const { SelectionHeader } = await import('./selection-header');
const { tileMenuOf } = await import('./deleted-tile');

const ITEM: DeletedItem = {
  id: '00000000-0000-4000-8000-000000000011',
  name: 'IMG_1.jpg',
  isFolder: false,
  bytes: 2_000_000,
  deletedAt: Date.parse('2026-11-06T12:00:00Z'),
  day: '2026-11-06',
  purgeDay: '2027-11-06',
  daysLeft: 364,
  kept: 364 / 365,
  critical: false,
  who: 'You',
};

function render(props: Partial<SelectionHeaderProps>): string {
  return renderToStaticMarkup(
    createElement(SelectionHeader, {
      picked: { count: 4, bytes: 58_000_000 },
      disabled: false,
      onClear: () => undefined,
      onRestore: () => undefined,
      onDeleteNow: () => undefined,
      ...props,
    }),
  );
}

describe('Recently deleted selection bar', () => {
  it('names the picked count and size with a tonal Restore and a destructive Delete now', () => {
    const html = render({});
    expect(html).toContain('4 selected');
    expect(html).toContain('data-variant="tonal" data-off="no">Restore');
    expect(html).toContain('data-variant="destructive" data-off="no">Delete now');
  });

  it('never offers Delete now to a member', () => {
    const html = render({ onDeleteNow: null });
    expect(html).toContain('>Restore<');
    expect(html).not.toContain('Delete now');
  });

  it('turns the actions off with nothing picked or the hub away', () => {
    expect(render({ picked: { count: 0, bytes: 0 } })).toContain('data-off="yes">Restore');
    expect(render({ disabled: true })).toContain('data-off="yes">Delete now');
  });
});

describe('Recently deleted tile menu', () => {
  const handlers = {
    onPress: (): void => undefined,
    onRestore: (): void => undefined,
    onDeleteNow: (): void => undefined,
    disabled: false,
  };

  it('offers Restore and a destructive Delete now to the owner', () => {
    const menu = tileMenuOf(ITEM, handlers);
    expect(menu.map((item) => item.label)).toEqual(['Restore', 'Delete now']);
    expect(menu[1]?.destructive).toBe(true);
  });

  it('offers a member only Restore', () => {
    const menu = tileMenuOf(ITEM, { ...handlers, onDeleteNow: null });
    expect(menu.map((item) => item.label)).toEqual(['Restore']);
  });

  it('shows the actions turned off while the hub is away instead of ignoring the press', () => {
    const menu = tileMenuOf(ITEM, { ...handlers, disabled: true });
    expect(menu.every((item) => item.disabled === true)).toBe(true);
  });

  it('restores or deletes the item the menu was opened on', () => {
    const restored: DeletedItem[] = [];
    const removed: DeletedItem[] = [];
    const menu = tileMenuOf(ITEM, {
      ...handlers,
      onRestore: (item) => {
        restored.push(item);
      },
      onDeleteNow: (item) => {
        removed.push(item);
      },
    });
    menu[0]?.onPress();
    menu[1]?.onPress();
    expect(restored).toEqual([ITEM]);
    expect(removed).toEqual([ITEM]);
  });
});
