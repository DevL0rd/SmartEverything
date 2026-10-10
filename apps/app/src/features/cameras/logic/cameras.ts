import {
  displayName,
  isCamera,
  roomNameOf,
  type CameraRow,
  type RoomRow,
} from '@smarteverything/domain';
import type { Device } from '../../../store/state';

export interface CameraEntry {
  readonly device: Device;
  readonly camera: CameraRow | null;
  readonly name: string;
  readonly room: string | null;
}

export interface CameraSources {
  readonly devices: readonly Device[];
  readonly cameras: Readonly<Record<string, CameraRow>>;
  readonly rooms: readonly RoomRow[];
}

export function cameraEntriesOf({ devices, cameras, rooms }: CameraSources): CameraEntry[] {
  const shown = devices.filter((device) => !device.hidden && isCamera(device));
  return shown.map((device) => ({
    device,
    camera: cameras[device.id] ?? null,
    name: displayName(device, devices, rooms),
    room: roomNameOf(device, rooms) ?? device.provider_room,
  }));
}

export function sameEntries(left: readonly CameraEntry[], right: readonly CameraEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return (
        other?.device === entry.device &&
        other.camera === entry.camera &&
        other.name === entry.name &&
        other.room === entry.room
      );
    })
  );
}

export function neighbourOf(
  entries: readonly CameraEntry[],
  deviceId: string,
  step: 1 | -1,
): CameraEntry | null {
  const index = entries.findIndex((entry) => entry.device.id === deviceId);
  if (index === -1 || entries.length < 2) {
    return null;
  }
  return entries[(index + step + entries.length) % entries.length] ?? null;
}

export function presetsOf(entry: CameraEntry): readonly string[] {
  const preset = entry.device.capabilities.find((capability) => capability.key === 'ptz_preset');
  return preset?.value.kind === 'enum' ? preset.value.options : [];
}
