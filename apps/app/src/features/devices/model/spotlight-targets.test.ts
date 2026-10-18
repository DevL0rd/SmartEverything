import { describe, expect, it } from 'vitest';
import { spotlightSections, type SpotlightDevice, type SpotlightRoom } from './spotlight-targets';

const ROOMS: readonly SpotlightRoom[] = [
  { id: 'kitchen', name: 'Kitchen', position: 1 },
  { id: 'lounge', name: 'Lounge', position: 0 },
];

function device(
  id: string,
  kind: SpotlightDevice['kind'],
  room: string | null,
  name: string,
): SpotlightDevice {
  return {
    id,
    kind,
    model: 'generic',
    name,
    display_name: null,
    room_id: room,
    hidden: false,
  };
}

const DEVICES: readonly SpotlightDevice[] = [
  device('l1', 'light', 'kitchen', 'Spot'),
  device('l2', 'light', 'lounge', 'Lamp'),
  device('l3', 'light', null, 'Hall'),
  device('f1', 'fan', 'lounge', 'Fan'),
  { ...device('l4', 'light', 'lounge', 'Hidden'), hidden: true },
];

const ANY = (): boolean => true;

describe('spotlight targets', () => {
  it('lists only lights for the Light entry, grouped by room in room order', () => {
    const sections = spotlightSections('light', DEVICES, ROOMS, ANY);
    expect(sections.map((section) => section.title)).toEqual(['Lounge', 'Kitchen', 'No room']);
    expect(sections.flatMap((section) => section.rows.map((row) => row.key))).toEqual([
      'l2',
      'l1',
      'l3',
    ]);
  });

  it('lists everything that is not a light for the Device entry', () => {
    const sections = spotlightSections('device', DEVICES, ROOMS, ANY);
    expect(sections.flatMap((section) => section.rows.map((row) => row.key))).toEqual(['f1']);
    expect(sections[0]?.rows[0]?.subtitle).toBe('Fan');
  });

  it('leaves out hidden devices and anything the widget cannot show', () => {
    const none = spotlightSections('light', DEVICES, ROOMS, (candidate) => candidate.id === 'l1');
    expect(none.flatMap((section) => section.rows.map((row) => row.key))).toEqual(['l1']);
  });

  it('selects a device with the options the spotlight widget stores', () => {
    const [section] = spotlightSections('light', DEVICES, ROOMS, ANY);
    expect(section?.rows[0]?.options).toEqual({ deviceId: 'l2' });
  });
});
