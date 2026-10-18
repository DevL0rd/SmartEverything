import { describe, expect, it } from 'vitest';
import type { NamedDevice } from '@smarteverything/domain';
import { hiddenDevices } from './hidden-devices';

function device(
  id: string,
  name: string,
  hidden: boolean,
): NamedDevice & { readonly hidden: boolean } {
  return {
    id,
    name,
    display_name: null,
    room_id: null,
    hidden,
    kind: 'light',
    model: 'model',
  };
}

describe('the devices listed in Device settings', () => {
  it('lists only the devices hidden from Home', () => {
    const shown = device('a', 'Lamp', false);
    const hidden = device('b', 'Heater', true);
    expect(hiddenDevices([shown, hidden]).map((entry) => entry.device.id)).toEqual(['b']);
  });

  it('is empty when nothing is hidden', () => {
    expect(hiddenDevices([device('a', 'Lamp', false)])).toEqual([]);
  });

  it('sorts numbered names naturally', () => {
    const names = ['Ceiling light 10', 'Ceiling light 2', 'Ceiling light 1'].map((name, index) =>
      device(String(index), name, true),
    );
    expect(hiddenDevices(names).map((entry) => entry.name)).toEqual([
      'Ceiling light 1',
      'Ceiling light 2',
      'Ceiling light 10',
    ]);
  });
});
