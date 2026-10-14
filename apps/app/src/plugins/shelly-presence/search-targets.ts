import type {
  ShellyPresenceDevice,
  ShellyPresenceOperationDescriptor,
} from '@smarteverything/domain';
import type { PluginDeviceSearchItem } from '../contract';
import { operationSearchItems } from './search-items';
interface Target {
  readonly title: string;
  readonly query: Readonly<Record<string, string>>;
}
const CREATE_COMPONENTS: Readonly<Record<string, string>> = {
  virtual_add: 'virtual-new',
  bthome_add_device: 'device-new',
  bthome_add_sensor: 'sensor-new',
};
function componentTargets(sensor: ShellyPresenceDevice, action: string): readonly Target[] {
  const create = CREATE_COMPONENTS[action];
  if (create !== undefined) return [{ title: '', query: { component: create } }];
  const names: Readonly<Record<string, readonly string[]>> = {
    virtual_delete: ['boolean', 'number', 'enum', 'text', 'button', 'group'],
    virtual_config: ['boolean', 'number', 'enum', 'text', 'button', 'group'],
    virtual_set: ['boolean', 'number', 'enum', 'text', 'group'],
    virtual_toggle: ['boolean'],
    virtual_button: ['button'],
    bthome_device_config: ['bthomedevice'],
    bthome_sensor_config: ['bthomesensor'],
    bthome_delete_device: ['bthomedevice'],
    bthome_delete_sensor: ['bthomesensor'],
  };
  const types = names[action] ?? [];
  return sensor.components
    .filter((entry) => types.includes(entry.component))
    .map((entry) => ({ title: entry.key, query: { component: entry.key } }));
}
function scriptTargets(sensor: ShellyPresenceDevice): readonly Target[] {
  return (sensor.resources?.scripts?.scripts ?? []).map((entry) => ({
    title: entry.name ?? `Script ${String(entry.id)}`,
    query: { item: String(entry.id) },
  }));
}
function scheduleTargets(sensor: ShellyPresenceDevice): readonly Target[] {
  return (sensor.resources?.schedules?.jobs ?? []).map((entry) => ({
    title: entry.timespec,
    query: { item: String(entry.id) },
  }));
}
function webhookTargets(sensor: ShellyPresenceDevice): readonly Target[] {
  return (sensor.resources?.webhooks?.hooks ?? []).map((entry) => ({
    title: entry.name ?? entry.event,
    query: { item: String(entry.id) },
  }));
}
function storedTargets(sensor: ShellyPresenceDevice): readonly Target[] {
  return Object.keys(sensor.resources?.storedValues?.items ?? {}).map((key) => ({
    title: key,
    query: { item: `key:${key}` },
  }));
}
const RESOURCE_TARGETS: Readonly<
  Record<string, (sensor: ShellyPresenceDevice) => readonly Target[]>
> = {
  script_config: scriptTargets,
  script_code: scriptTargets,
  script_put_code: scriptTargets,
  script_eval: scriptTargets,
  script_start: scriptTargets,
  script_stop: scriptTargets,
  script_delete: scriptTargets,
  schedule_update: scheduleTargets,
  schedule_delete: scheduleTargets,
  schedule_eval: scheduleTargets,
  webhook_update: webhookTargets,
  webhook_delete: webhookTargets,
  kvs_set: storedTargets,
  kvs_delete: storedTargets,
};
function resourceTargets(sensor: ShellyPresenceDevice, action: string): readonly Target[] {
  return RESOURCE_TARGETS[action]?.(sensor) ?? [];
}
function zoneTargets(sensor: ShellyPresenceDevice, action: string): readonly Target[] {
  if (action === 'add_zone') return [{ title: '', query: { zone: 'new' } }];
  if (action !== 'set_zone' && action !== 'delete_zone') return [];
  return sensor.zones
    .filter((zone) => action !== 'delete_zone' || !zone.main)
    .map((zone) => ({
      title: zone.config.name ?? zone.key,
      query: { zone: String(zone.config.id) },
    }));
}
export function targetedOperationSearch(
  sensor: ShellyPresenceDevice,
  operation: ShellyPresenceOperationDescriptor,
): readonly PluginDeviceSearchItem[] {
  const items = operationSearchItems(operation);
  const targets = [
    ...componentTargets(sensor, operation.action),
    ...resourceTargets(sensor, operation.action),
    ...zoneTargets(sensor, operation.action),
  ];
  if (targets.length === 0) return items;
  return targets.flatMap((target) =>
    items.map((item) => ({
      ...item,
      id: `${item.id}:${Object.values(target.query).join(':')}`,
      title: target.title === '' ? item.title : `${target.title} · ${item.title}`,
      query: { ...item.query, ...target.query },
    })),
  );
}
