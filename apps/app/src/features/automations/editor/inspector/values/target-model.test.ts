import { describe, expect, it } from 'vitest';
import { NO_PORT_SCOPE } from './literal-model';
import {
  LACKS_CONTROL,
  chosenControlOf,
  devicesForControl,
  reachableOf,
  targetFormOf,
  targetValue,
} from './target-model';

const DEVICES = [
  { id: 'lamp', label: 'Nursery lamp' },
  { id: 'plug', label: 'Kettle plug' },
  { id: 'strip', label: 'Desk strip' },
];

const DIMMABLE = new Set(['lamp', 'strip']);

describe('target model', () => {
  it('lists only devices that have the chosen control for Several', () => {
    const shown = devicesForControl(DEVICES, [], (id) => DIMMABLE.has(id));
    expect(shown.map((row) => row.id)).toEqual(['lamp', 'strip']);
  });

  it('keeps a held device without the control as unavailable so it can be removed', () => {
    const shown = devicesForControl(DEVICES, ['plug'], (id) => DIMMABLE.has(id));
    expect(shown.find((row) => row.id === 'plug')?.unavailable).toBe(LACKS_CONTROL);
  });

  it('lists every device while no control is chosen', () => {
    expect(devicesForControl(DEVICES, [], null)).toBe(DEVICES);
  });

  it('keeps only targets that reach a capable device', () => {
    expect(reachableOf(DEVICES, new Set(['strip'])).map((row) => row.id)).toEqual(['strip']);
    expect(reachableOf(DEVICES, null)).toBe(DEVICES);
  });

  it('reads the chosen control and its source from the sibling port', () => {
    const scope = {
      ...NO_PORT_SCOPE,
      ports: { control: { lit: 'brightness' } },
      controls: {
        control: { t: 'pick', source: 'device.writable_controls', multiple: false },
      },
    } as const;
    expect(chosenControlOf(scope)).toEqual({
      id: 'brightness',
      source: 'device.writable_controls',
    });
    expect(chosenControlOf({ ...scope, ports: { control: { lit: '' } } })).toBeNull();
    expect(chosenControlOf(NO_PORT_SCOPE)).toBeNull();
  });

  it('round-trips every target shape the hub accepts', () => {
    const shapes = [
      { device: 'lamp' },
      { devices: ['lamp', 'strip'] },
      { room: 'nursery' },
      { room: 'nursery', families: ['light'] },
      { group: 'downstairs' },
    ];
    for (const shape of shapes) expect(targetValue(targetFormOf(shape))).toEqual(shape);
  });
});
