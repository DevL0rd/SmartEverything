import type { DeviceLike } from './capability-choices';

interface Named {
  readonly id: string;
  readonly name: string;
}

export interface Names {
  readonly devices: readonly DeviceLike[];
  readonly scenes: readonly Named[];
  readonly people: readonly Named[];
  readonly chats: readonly { readonly id: string; readonly title: string }[];
}

const GONE_DEVICE = 'a removed device';

export function deviceName(names: Names, deviceId: string): string {
  return names.devices.find((device) => device.id === deviceId)?.label ?? GONE_DEVICE;
}

export function personName(names: Names, id: string): string {
  return names.people.find((row) => row.id === id)?.name ?? 'someone removed';
}
