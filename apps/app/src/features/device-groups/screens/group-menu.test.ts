import { describe, expect, it, vi } from 'vitest';
import type { DeviceGroupRow, DeviceTarget } from '@smarteverything/domain';
import { pageMenu } from './group-menu';

vi.mock('expo-router', () => ({ router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock('../data/remove-group', () => ({
  confirmRemoval: vi.fn(),
  removeGroup: vi.fn(),
}));
vi.mock(import('../../../components/toast-store'), async (importOriginal) => ({
  ...(await importOriginal()),
  notify: vi.fn(),
}));

const GROUP: DeviceGroupRow = {
  id: 'g1',
  name: 'Reading',
  device_ids: [],
  created_at: '2026-10-18T00:00:00.000Z',
  updated_at: '2026-10-18T00:00:00.000Z',
};

const labels = (items: ReturnType<typeof pageMenu>): readonly string[] =>
  items.map((item) => item.label);

describe('the group page menu', () => {
  it('lists edit, add to home and remove for a named group', () => {
    const items = pageMenu({
      target: { kind: 'group', groupId: 'g1' },
      group: GROUP,
      uses: [],
      onEdit: vi.fn(),
      addToHome: vi.fn(),
    });
    expect(labels(items)).toStrictEqual(['Edit group', 'Add to Home', 'Remove group']);
  });

  it('lists the room page, add to home and the room choice for room lights, with no edit or remove', () => {
    const items = pageMenu({
      target: { kind: 'room', roomId: 'r1', families: ['light'] },
      group: null,
      uses: [],
      onEdit: vi.fn(),
      addToHome: vi.fn(),
    });
    expect(labels(items)).toStrictEqual(['Room page', 'Add to Home', 'Choose room for lights']);
  });

  it('adds the widget for this very target to Home', () => {
    const addToHome = vi.fn();
    const target: DeviceTarget = { kind: 'room', roomId: 'r1', families: ['light'] };
    const home = pageMenu({ target, group: null, uses: [], onEdit: vi.fn(), addToHome }).find(
      (item) => item.label === 'Add to Home',
    );
    home?.onPress();
    expect(addToHome).toHaveBeenCalledOnce();
    expect(addToHome.mock.calls[0]?.[0]).toMatchObject({
      key: 'room-lights:r1',
      type: 'device-group',
      options: { target },
    });
  });

  it('has no menu for a target that is neither a group nor a room', () => {
    expect(
      pageMenu({
        target: { kind: 'devices', deviceIds: ['a'] },
        group: null,
        uses: [],
        onEdit: vi.fn(),
        addToHome: vi.fn(),
      }),
    ).toStrictEqual([]);
  });
});
