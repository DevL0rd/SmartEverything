import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPUTER_ROLE_MODELS, type TableRow } from '@smarteverything/domain';
import { expect, it, vi } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import type * as Selectors from '../../../store/selectors';
import type * as ExternalStore from '../../../design/external-store';
import type { Device } from '../../../store/state';

const devices = vi.hoisted(() => new Array<ReturnType<typeof deviceFixture>>());
const pass = ({ children }: { readonly children?: ReactNode }): ReactNode =>
  createElement(Fragment, null, children);

vi.mock('../../../store/selectors', async (original) => ({
  ...(await original<typeof Selectors>()),
  useDevices: (): readonly Device[] => devices,
  useRooms: (): readonly TableRow<'rooms'>[] => [{ id: 'study', name: 'Study', position: 0 }],
}));
vi.mock('../../../api/settings', () => ({ removeRoom: vi.fn() }));
vi.mock('../../../components/confirm-store', () => ({ confirm: vi.fn() }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: pass }));
vi.mock('../../../components/list-row', () => ({
  ListRow: ({ subtitle }: { readonly subtitle: string }): ReactNode => subtitle,
}));
vi.mock('../../../components/menu', () => ({ OverflowButton: pass }));
vi.mock('../../../components/icon', () => ({ Icon: pass }));
vi.mock('../../../components/section', () => ({ Section: pass }));
vi.mock('../../../components/reorderable-list', () => ({
  ReorderableList: ({
    items,
    renderItem,
  }: {
    readonly items: readonly { readonly id: string }[];
    readonly renderItem: (item: { readonly id: string }) => ReactNode;
  }): ReactNode => items.map((item) => createElement(Fragment, { key: item.id }, renderItem(item))),
}));
vi.mock('../../../design/external-store', async (original) => ({
  ...(await original<typeof ExternalStore>()),
  useValue: (): null => null,
}));
vi.mock('../../../settings/text-edit-sheet', () => ({ TextEditSheet: (): null => null }));
vi.mock('./rooms', () => ({
  moveRoom: vi.fn(),
  openRenameRoom: vi.fn(),
  reorderRooms: vi.fn(),
  roomEditor: { set: vi.fn() },
}));
vi.mock('../settings-log', () => ({ trackSetting: vi.fn() }));

const { RoomsBlock } = await import('./rooms-block');

it('counts the hub, paired laptop and hidden devices assigned to the room', () => {
  devices.push(
    deviceFixture(0, {
      kind: 'computer',
      model: COMPUTER_ROLE_MODELS.hub,
      external_id: 'computer:hub',
      name: 'Laptop',
      room_id: 'study',
      capabilities: [],
      details: {},
    }),
    deviceFixture(1, {
      kind: 'computer',
      model: COMPUTER_ROLE_MODELS.pc,
      name: 'Laptop',
      room_id: 'study',
    }),
    deviceFixture(2, { room_id: 'study', hidden: true }),
  );
  expect(renderToStaticMarkup(createElement(RoomsBlock))).toContain('3 devices');
});
