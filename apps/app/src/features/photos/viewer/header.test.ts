import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { isIconName } from '../../../components/icon-glyphs';
import type { HeaderControls } from './header';

interface Props {
  readonly children?: ReactNode;
  readonly icon?: string;
  readonly name?: string;
  readonly label?: string;
  readonly selected?: boolean;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../components/menu', () => ({
  useAnchoredMenu: (): { readonly ref: null; readonly open: () => void; readonly menu: null } => ({
    ref: null,
    open: () => undefined,
    menu: null,
  }),
}));
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: stub('View'),
}));

const { DesktopHeader, PhoneActions, PhoneHeader } = await import('./header');

const CONTROLS: HeaderControls = {
  starred: true,
  infoOpen: false,
  busy: false,
  albums: [],
  more: [],
  onClose: () => undefined,
  onFavourite: () => undefined,
  onShare: () => undefined,
  onInfo: () => undefined,
  onTrash: () => undefined,
};

const TEXT = { title: 'Saturday 7 November 2026 · 10:42', detail: 'Lisbon, Portugal' };

function iconsOf(entries: readonly Seen[]): readonly string[] {
  return entries.flatMap((entry) => {
    const icon = entry.kind === 'Icon' ? entry.props.name : entry.props.icon;
    return icon === undefined ? [] : [icon];
  });
}

function rendered(node: ReactElement): readonly Seen[] {
  seen.length = 0;
  renderToStaticMarkup(node);
  return [...seen];
}

describe('viewer header icons', () => {
  it('draws every desktop and phone control with an icon the app has', () => {
    const all = [
      ...rendered(createElement(DesktopHeader, { text: TEXT, controls: CONTROLS })),
      ...rendered(createElement(PhoneHeader, { text: TEXT, controls: CONTROLS })),
      ...rendered(createElement(PhoneActions, { controls: CONTROLS })),
    ];
    const icons = iconsOf(all);
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.filter((icon) => !isIconName(icon))).toEqual([]);
  });

  it('marks a favourite with the one Favourite and Star mark, selected when it is one', () => {
    const desktop = rendered(createElement(DesktopHeader, { text: TEXT, controls: CONTROLS }));
    const favourite = desktop.find((entry) => entry.props.label === 'Remove from favourites');
    expect(favourite?.props.icon).toBe('star');
    expect(favourite?.props.selected).toBe(true);
    const phone = rendered(createElement(PhoneActions, { controls: CONTROLS }));
    const action = phone.find(
      (entry) => entry.kind === 'Interactive' && entry.props.label === 'Favourite',
    );
    expect(action?.props.selected).toBe(true);
    expect(phone.some((entry) => entry.kind === 'Icon' && entry.props.name === 'star')).toBe(true);
  });
});
