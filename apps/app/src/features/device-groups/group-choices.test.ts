import { describe, expect, it } from 'vitest';
import { DEVICE_ROW } from '@smarteverything/domain';
import type { Device } from '../../store/state';
import { groupControlChoices } from './group-choices';

const STAMP = '2026-01-01T00:00:00.000Z';
const POWER = { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } };

function lamp(id: string): Device {
  return {
    ...DEVICE_ROW.parse({
      id: `7e000000-0000-4000-8000-${id.padStart(12, '0')}`,
      provider: 'xiaomi',
      external_id: id,
      parent_id: null,
      kind: 'light',
      name: id,
      display_name: null,
      model: 'generic.model',
      manufacturer: 'Maker',
      provider_room: null,
      room_id: null,
      online: true,
      capabilities: [POWER],
      details: {},
      hidden: false,
      favourite: false,
      position: 0,
      created_at: STAMP,
      updated_at: STAMP,
    }),
    label: id,
  };
}

describe('groupControlChoices', () => {
  it('has no controls for no devices', () => {
    expect(groupControlChoices([])).toStrictEqual([]);
  });

  it('shares one result between calls with the same members', () => {
    const first = lamp('1');
    const second = lamp('2');
    expect(groupControlChoices([first, second])).toBe(groupControlChoices([first, second]));
  });

  it('works out the controls again when a member changes', () => {
    const first = lamp('1');
    const before = groupControlChoices([first, lamp('2')]);
    expect(groupControlChoices([first, lamp('3')])).not.toBe(before);
  });
});
