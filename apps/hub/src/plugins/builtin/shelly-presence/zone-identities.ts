import type { ShellyPresenceDevice } from '@smarteverything/domain';
import type { PluginRecords } from '../contract';
import { saveEnrollment, type ShellyEnrollment } from './enrollment';
import type { ShellyInventory } from './component-inventory';

export function reconcileZoneIdentities(
  records: PluginRecords,
  enrollment: ShellyEnrollment,
  inventory: ShellyInventory,
): ShellyEnrollment {
  const activeZones = Object.keys(inventory.config).flatMap((key) =>
    key.startsWith('presencezone:') ? [Number(key.slice('presencezone:'.length))] : [],
  );
  const removed = enrollment.activeZones.filter((id) => !activeZones.includes(id));
  const generations = { ...enrollment.generations };
  for (const id of removed) generations[String(id)] = (generations[String(id)] ?? 0) + 1;
  const next = { ...enrollment, generations, activeZones };
  saveEnrollment(records, next);
  return next;
}
export function removedZoneIds(
  before: ShellyPresenceDevice | null,
  after: ShellyPresenceDevice,
): string[] {
  const current = new Set(after.zones.map((zone) => zone.externalId));
  return (
    before?.zones
      .filter((zone) => !current.has(zone.externalId))
      .map((zone) => zone.externalId.slice('shelly-presence:'.length)) ?? []
  );
}

export function resetZoneIdentities(
  records: PluginRecords,
  enrollment: ShellyEnrollment,
): ShellyEnrollment {
  const generations = { ...enrollment.generations };
  for (const id of enrollment.activeZones)
    generations[String(id)] = (generations[String(id)] ?? 0) + 1;
  const next = { ...enrollment, generations, activeZones: [] };
  saveEnrollment(records, next);
  return next;
}
