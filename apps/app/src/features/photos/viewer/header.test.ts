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
vi.mock('../../../components/charts/arc', () => ({ Arc: stub('Arc') }));
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

const { CompactControls, DesktopControls, PhoneActions, PhoneControls, compactMoreItems } =
  await import('./header');

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
  edit: {
    label: 'Edit',
    available: true,
    busy: false,
    onEdit: () => undefined,
    onRevert: null,
    job: { progress: 0.4, label: 'Saving the edited video, 40%' },
  },
};

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
      ...rendered(createElement(DesktopControls, { controls: CONTROLS })),
      ...rendered(createElement(PhoneControls, { controls: CONTROLS })),
      ...rendered(createElement(CompactControls, { controls: CONTROLS })),
      ...rendered(createElement(PhoneActions, { controls: CONTROLS })),
    ];
    const icons = iconsOf(all);
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.filter((icon) => !isIconName(icon))).toEqual([]);
  });

  it('marks a favourite with the one Favourite and Star mark, selected when it is one', () => {
    const desktop = rendered(createElement(DesktopControls, { controls: CONTROLS }));
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

  it('offers Edit on desktop and phone and shows a running video edit', () => {
    const desktop = rendered(createElement(DesktopControls, { controls: CONTROLS }));
    expect(desktop.find((entry) => entry.props.label === 'Edit')?.props.icon).toBe('pencil');
    expect(desktop.some((entry) => entry.kind === 'Arc')).toBe(true);
    const phone = rendered(createElement(PhoneActions, { controls: CONTROLS }));
    expect(
      phone.some((entry) => entry.kind === 'Interactive' && entry.props.label === 'Edit'),
    ).toBe(true);
  });

  it('hides Edit when the photo cannot be edited', () => {
    const controls = { ...CONTROLS, edit: { ...CONTROLS.edit, available: false } };
    const desktop = rendered(createElement(DesktopControls, { controls }));
    expect(desktop.some((entry) => entry.props.label === 'Edit')).toBe(false);
    const phone = rendered(createElement(PhoneActions, { controls }));
    expect(
      phone.some((entry) => entry.kind === 'Interactive' && entry.props.label === 'Edit'),
    ).toBe(false);
  });

  it('keeps favourite, info and More inline in a narrow stage and moves the rest into More', () => {
    const compact = rendered(createElement(CompactControls, { controls: CONTROLS }));
    const inline = compact.filter((entry) => entry.kind === 'IconButton').map((e) => e.props.icon);
    expect(inline).toEqual(['star', 'info', 'ellipsis']);
    const albums = vi.fn();
    const items = compactMoreItems(CONTROLS, albums);
    expect(items.map((item) => item.label)).toEqual(['Edit', 'Add to album', 'Share link']);
    items[1]?.onPress();
    expect(albums).toHaveBeenCalledOnce();
    const plain = compactMoreItems(
      { ...CONTROLS, edit: { ...CONTROLS.edit, available: false } },
      albums,
    );
    expect(plain.map((item) => item.label)).toEqual(['Add to album', 'Share link']);
  });
});
