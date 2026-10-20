import type { DeviceLifecycleChange, DiscoveredDevice, JsonValue } from '@smarteverything/domain';
import type { DeviceIdentity, DeviceRecord } from '../database/port';

export interface DeviceLifecycle {
  readonly device: DeviceRecord;
  readonly identity: DeviceIdentity;
  readonly change: DeviceLifecycleChange;
  readonly detail: Readonly<Record<string, JsonValue>>;
}

export interface KnownDevice {
  readonly device: DeviceRecord;
  readonly identity: DeviceIdentity;
}

export function identityOfDiscovered(
  device: DeviceRecord,
  discovered: DiscoveredDevice,
): DeviceIdentity {
  return {
    id: device.id,
    kind: discovered.kind,
    name: discovered.name,
    model: discovered.model,
    manufacturer: discovered.manufacturer,
    providerRoom: discovered.room,
  };
}

function keysOf(device: DeviceRecord): readonly string[] {
  return device.capabilities.map((capability) => capability.key).sort();
}

function firmwareOf(device: DeviceRecord): string | null {
  const firmware = device.details['firmware'];
  return typeof firmware === 'string' ? firmware : null;
}

function capabilityChange(
  before: DeviceRecord,
  after: DeviceRecord,
): DeviceLifecycle['detail'] | null {
  const was = keysOf(before);
  const now = keysOf(after);
  const added = now.filter((key) => !was.includes(key));
  const removed = was.filter((key) => !now.includes(key));
  return added.length === 0 && removed.length === 0 ? null : { added, removed };
}

function identityChanges(before: DeviceIdentity, after: DeviceIdentity): Change[] {
  const changes: Change[] = [];
  if (before.name !== after.name) {
    changes.push({ change: 'renamed', detail: { from: before.name, to: after.name } });
  }
  if (
    before.model !== after.model ||
    before.manufacturer !== after.manufacturer ||
    before.kind !== after.kind
  ) {
    changes.push({ change: 'replaced', detail: { from: before.model, to: after.model } });
  }
  return changes;
}

interface Change {
  readonly change: DeviceLifecycleChange;
  readonly detail: DeviceLifecycle['detail'];
}

function recordChanges(before: DeviceRecord, after: DeviceRecord): Change[] {
  const changes: Change[] = [];
  if (before.roomId !== after.roomId) {
    changes.push({ change: 'moved', detail: { from: before.roomId, to: after.roomId } });
  }
  const capabilities = capabilityChange(before, after);
  if (capabilities !== null) {
    changes.push({ change: 'capabilities_changed', detail: capabilities });
  }
  const was = firmwareOf(before);
  const now = firmwareOf(after);
  if (was !== null && now !== null && was !== now) {
    changes.push({ change: 'firmware_changed', detail: { from: was, to: now } });
  }
  return changes;
}

export function lifecycleOf(
  before: KnownDevice | undefined,
  after: KnownDevice,
): readonly DeviceLifecycle[] {
  const changes: readonly Change[] =
    before === undefined
      ? [{ change: 'added', detail: {} }]
      : [
          ...identityChanges(before.identity, after.identity),
          ...recordChanges(before.device, after.device),
        ];
  return changes.map(({ change, detail }) => ({
    device: after.device,
    identity: after.identity,
    change,
    detail,
  }));
}

export function removalOf(known: KnownDevice): DeviceLifecycle {
  return { device: known.device, identity: known.identity, change: 'removed', detail: {} };
}
