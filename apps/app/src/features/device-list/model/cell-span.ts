import { isCamera } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import type { Weights } from './card-weights';

export type CellSpan = 'half' | 1 | 2;

export function spanOf(device: Device, weights: Weights): CellSpan {
  if (isCamera(device)) {
    return 2;
  }
  if (!device.online) {
    return 'half';
  }
  const weight = weights.get(device.id) ?? 'none';
  if (weight === 'many') {
    return 2;
  }
  return weight === 'one' ? 1 : 'half';
}

export interface Slot {
  readonly key: string;
  readonly devices: readonly Device[];
  readonly span: number;
  readonly half: boolean;
}

function pairs(halves: readonly Device[]): readonly Slot[] {
  const out: Slot[] = [];
  for (let index = 0; index < halves.length; index += 2) {
    const shown = halves.slice(index, index + 2);
    out.push({
      key: shown.map((device) => device.id).join('+'),
      devices: shown,
      span: 1,
      half: true,
    });
  }
  return out;
}

export function slotsOf(devices: readonly Device[], weights: Weights): readonly Slot[] {
  const halves = devices.filter((device) => spanOf(device, weights) === 'half');
  const wide: Slot[] = [];
  const single: Slot[] = [];
  for (const device of devices) {
    const span = spanOf(device, weights);
    if (span !== 'half') {
      (span === 2 ? wide : single).push({ key: device.id, devices: [device], span, half: false });
    }
  }
  const cameras = wide.filter((slot) => slot.devices.some(isCamera));
  const others = wide.filter((slot) => !cameras.includes(slot));
  return [...cameras, ...others, ...single, ...pairs(halves)];
}
