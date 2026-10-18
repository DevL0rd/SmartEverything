import { describe, expect, it } from 'vitest';
import { baseNameOf, roomNameOf, replacedIds } from '../src';
import type { NamedDevice, NamedRoom } from '../src';

const KITCHEN: NamedRoom = { id: 'kitchen', name: 'Kitchen' };

interface Shape {
  readonly id: string;
  readonly name: string;
  readonly display?: string;
  readonly room?: string;
  readonly replaces?: string;
}

function device({ id, name, display, room, replaces }: Shape): NamedDevice {
  return {
    id,
    kind: 'light',
    model: 'model',
    name,
    display_name: display ?? null,
    room_id: room ?? null,
    details: replaces === undefined ? {} : { replaces },
  };
}

describe('device names', () => {
  it('uses the display name verbatim and never prefixes the room', () => {
    const lamp = device({ id: 'a', name: 'Lamp', display: 'Light 3', room: 'kitchen' });
    expect(baseNameOf(lamp)).toBe('Light 3');
    expect(roomNameOf(lamp, [KITCHEN])).toBe('Kitchen');
  });

  it('falls back to the stored name', () => {
    expect(baseNameOf(device({ id: 'a', name: 'Lamp', room: 'kitchen' }))).toBe('Lamp');
  });

  it('leaves twins with the same name unchanged', () => {
    const names = [
      device({ id: 'a', name: 'Light', room: 'kitchen' }),
      device({ id: 'b', name: 'light' }),
    ].map(baseNameOf);
    expect(names).toStrictEqual(['Light', 'light']);
  });

  it('has no room for an unplaced or unknown room device', () => {
    expect(roomNameOf(device({ id: 'a', name: 'Lamp' }), [KITCHEN])).toBeNull();
    expect(roomNameOf(device({ id: 'a', name: 'Lamp', room: 'gone' }), [KITCHEN])).toBeNull();
  });

  it('lists the devices a newer device replaces', () => {
    const devices = [
      device({ id: 'old', name: 'Lamp' }),
      device({ id: 'new', name: 'Lamp', replaces: 'old' }),
    ];
    expect([...replacedIds(devices)]).toStrictEqual(['old']);
  });
});
