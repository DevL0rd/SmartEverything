import type { SettingsRow, TableRow } from '@smarteverything/domain';
import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ListRowProps } from '../../../components/list-row';
import type { ReorderableListProps } from '../../../components/reorderable-list';

interface TextProps {
  readonly children: ReactNode;
  readonly numberOfLines?: number;
}

const fixture = vi.hoisted(() => ({
  placeName: 'W'.repeat(120),
  room: { id: 'fixture-room', name: 'W'.repeat(60), position: 0 },
  text: vi.fn<(_: TextProps) => null>(() => null),
  row: vi.fn<(props: ListRowProps) => ReactNode>((props) => props.trailing),
}));

function childrenOf({ children }: { readonly children?: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('../../../api/settings', () => ({ removeRoom: vi.fn(), updateHome: vi.fn() }));
vi.mock('../../../components/button', () => ({ Button: (): null => null }));
vi.mock('../../../components/card', () => ({ Card: childrenOf }));
vi.mock('../../../components/confirm-store', () => ({ confirm: vi.fn() }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/list-row', () => ({ ListRow: fixture.row }));
vi.mock('../../../components/menu', () => ({ OverflowButton: (): null => null }));
vi.mock('../../../components/reorderable-list', () => ({
  ReorderableList: ({
    items,
    keyOf,
    renderItem,
  }: ReorderableListProps<TableRow<'rooms'>>): ReactNode =>
    items.map((item) => createElement(Fragment, { key: keyOf(item) }, renderItem(item))),
}));
vi.mock('../../../components/section', () => ({ Section: childrenOf }));
vi.mock('../../../components/text', () => ({ Text: fixture.text }));
vi.mock('../../../components/toast-store', () => ({ notifyFailure: vi.fn() }));
vi.mock('../../../design/external-store', () => ({ useValue: (): null => null }));
vi.mock('../../../design/size-class', () => ({
  useSizeClass: (): { readonly width: 'compact' } => ({ width: 'compact' }),
}));
vi.mock('../../../settings/text-edit-sheet', () => ({ TextEditSheet: (): null => null }));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => 0 }));
vi.mock('../../../store/selectors', () => ({
  useDevices: (): readonly { readonly room_id: string }[] => [{ room_id: fixture.room.id }],
  useIsOwner: (): boolean => true,
  useRooms: (): readonly TableRow<'rooms'>[] => [fixture.room],
  useSettings: (): Pick<SettingsRow, 'latitude' | 'longitude' | 'location_name' | 'time_zone'> => ({
    latitude: 51.5,
    longitude: 0.1,
    location_name: fixture.placeName,
    time_zone: 'UTC',
  }),
}));
vi.mock('./location-sheet', () => ({ LocationSheet: (): null => null }));
vi.mock('./rooms', () => ({
  roomEditor: {},
  moveRoom: vi.fn(),
  openRenameRoom: vi.fn(),
  reorderRooms: vi.fn(),
}));

const { LocationCard } = await import('./location-card');
const { RoomsBlock } = await import('./rooms-block');

describe('Home settings names', () => {
  it('renders the whole saved place name', () => {
    renderToStaticMarkup(createElement(LocationCard));
    const title = fixture.text.mock.calls.map(([props]) => props).find(
      ({ children }) => children === fixture.placeName,
    );
    expect(title).toBeDefined();
    expect(title?.numberOfLines).toBeUndefined();
  });

  it('wraps the whole room name while keeping its assigned device count', () => {
    renderToStaticMarkup(createElement(RoomsBlock));
    expect(fixture.row.mock.calls.map(([props]) => props)).toContainEqual(
      expect.objectContaining({ title: fixture.room.name, wrapTitle: true, subtitle: '1 device' }),
    );
  });
});
