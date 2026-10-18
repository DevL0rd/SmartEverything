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
  if (
    removed.length === 0 &&
    activeZones.length === enrollment.activeZones.length &&
    activeZones.every((id, index) => id === enrollment.activeZones[index])
  )
    return enrollment;
  const generations = { ...enrollment.generations };
  for (const id of removed) generations[String(id)] = (generations[String(id)] ?? 0) + 1;
  const next = { ...enrollment, generations, activeZones };
  saveEnrollment(records, next);
  return next;
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
