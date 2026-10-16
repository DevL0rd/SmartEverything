import {
  AUTOMATION_EFFECTS_CAPABILITY,
  DEVICE_GROUP_CAPABILITY,
  type LiveTable,
} from '@smarteverything/domain';
import {
  serverSupportsAutomationEffects,
  serverSupportsDeviceGroups,
} from '../api/connection/server-capabilities';

export function deviceRuntimeTables(tables: readonly LiveTable[], url: string): LiveTable[] {
  return tables.filter(
    (table) =>
      (table !== 'device_groups' || serverSupportsDeviceGroups(url)) &&
      (table !== 'device_effect_targets' || serverSupportsAutomationEffects(url)),
  );
}
export function deviceRuntimeCapabilities(url: string): string[] {
  return [
    ...(serverSupportsDeviceGroups(url) ? [DEVICE_GROUP_CAPABILITY] : []),
    ...(serverSupportsAutomationEffects(url) ? [AUTOMATION_EFFECTS_CAPABILITY] : []),
  ];
}
