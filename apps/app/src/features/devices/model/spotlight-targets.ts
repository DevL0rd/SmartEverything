import {
  deviceFamily,
  baseNameOf,
  type NamedDevice,
  type NamedRoom,
} from '@smarteverything/domain';
import { compareText, titleCase } from '../../../format/text';

export type SpotlightKind = 'light' | 'device';

export interface SpotlightRoom extends NamedRoom {
  readonly position: number;
}

export interface SpotlightDevice extends NamedDevice {
  readonly hidden: boolean;
}

interface SpotlightRow {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string;
  readonly options: { readonly deviceId: string };
}

export interface SpotlightSection {
  readonly title: string;
  readonly rows: readonly SpotlightRow[];
}

const NO_ROOM = 'No room';

function wanted<T extends SpotlightDevice>(
  kind: SpotlightKind,
  device: T,
  spotlightable: (device: T) => boolean,
): boolean {
  if (device.hidden || !spotlightable(device)) {
    return false;
  }
  return (deviceFamily(device) === 'light') === (kind === 'light');
}

function rowOf(device: SpotlightDevice, name: string): SpotlightRow {
  return {
    key: device.id,
    title: name,
    subtitle: titleCase(deviceFamily(device).replaceAll('_', ' ')),
    options: { deviceId: device.id },
  };
}

export function spotlightSections<T extends SpotlightDevice>(
  kind: SpotlightKind,
  devices: readonly T[],
  rooms: readonly SpotlightRoom[],
  spotlightable: (device: T) => boolean,
): readonly SpotlightSection[] {
  const named = devices
    .filter((device) => wanted(kind, device, spotlightable))
    .map((device) => [device, baseNameOf(device)] as const);
  const ordered = [...rooms].sort((left, right) => left.position - right.position);
  const sections = ordered.map((room) => ({
    title: room.name,
    rows: named
      .filter(([device]) => device.room_id === room.id)
      .sort(([, left], [, right]) => compareText(left, right))
      .map(([device, name]) => rowOf(device, name)),
  }));
  const roomless = named
    .filter(([device]) => !rooms.some((room) => room.id === device.room_id))
    .sort(([, left], [, right]) => compareText(left, right))
    .map(([device, name]) => rowOf(device, name));
  return [...sections, { title: NO_ROOM, rows: roomless }].filter(
    (section) => section.rows.length > 0,
  );
}
