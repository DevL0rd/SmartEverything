import type { CapabilityKey, DeviceFamily, JsonValue } from '@smarteverything/domain';
import type { PropertyBinding } from '@smarteverything/xiaomi';
import { vacuumFamilyCommands } from '../../vacuum/command-service';
import { vacuumResync } from '../../vacuum/resync';
import type { DeviceIo } from './device-io';
import type { InventoryEntry } from './inventory';

export type ReadableBinding = PropertyBinding & { readonly key: CapabilityKey };

export interface DerivedState {
  readonly capability: CapabilityKey;
  readonly value: JsonValue;
}

export interface FamilyCommands {
  readonly handles: (capability: CapabilityKey) => boolean;
  readonly execute: (
    capability: CapabilityKey,
    value: JsonValue,
    io: Pick<DeviceIo, 'write' | 'action'>,
    liveValue: (key: CapabilityKey) => JsonValue | undefined,
  ) => Promise<JsonValue>;
  readonly derive: (capability: CapabilityKey, value: JsonValue) => readonly DerivedState[];
}

export interface FamilyHooks {
  readonly subscriptionBindings: (
    readable: readonly ReadableBinding[],
  ) => readonly ReadableBinding[];
  readonly commands: (entry: InventoryEntry) => FamilyCommands | null;
  readonly subscribed: (io: DeviceIo) => Promise<void>;
}

const DEFAULT_HOOKS: FamilyHooks = {
  subscriptionBindings: (readable) => readable,
  commands: () => null,
  subscribed: () => Promise.resolve(),
};

const FAMILY_HOOKS: ReadonlyMap<DeviceFamily, FamilyHooks> = new Map([
  [
    'vacuum',
    { ...DEFAULT_HOOKS, commands: vacuumFamilyCommands, subscribed: vacuumResync.subscribed },
  ],
]);

export function familyHooks(family: DeviceFamily): FamilyHooks {
  return FAMILY_HOOKS.get(family) ?? DEFAULT_HOOKS;
}
