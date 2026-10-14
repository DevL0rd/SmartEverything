import {
  shellyPresencePermission,
  SHELLY_PRESENCE_ACTION,
  SHELLY_PRESENCE_OPERATIONS,
  SHELLY_PRESENCE_OUTCOME,
  SHELLY_PRESENCE_PLUGIN_ID,
  SHELLY_PRESENCE_SNAPSHOT,
  SHELLY_PRESENCE_STREAM,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
  type ShellyPresenceOutcome,
} from '@smarteverything/domain';
import { callPluginTool } from '../../api/plugins';
import type { Device } from '../../store/state';
import { usePluginStream, type PluginStream } from '../shared/use-plugin-stream';

export function isPresence(device: Pick<Device, 'external_id'>): boolean {
  return device.external_id.startsWith(`${SHELLY_PRESENCE_PLUGIN_ID}:`);
}

export function isPhysicalPresence(device: Device): boolean {
  return isPresence(device) && device.parent_id === null;
}

export function usePresence(device: Device): PluginStream<ShellyPresenceDevice> {
  const stream = usePluginStream(
    SHELLY_PRESENCE_PLUGIN_ID,
    SHELLY_PRESENCE_STREAM,
    SHELLY_PRESENCE_SNAPSHOT,
  );
  if (stream.state !== 'ready') return stream;
  const value = stream.value.devices.find(
    (sensor) =>
      sensor.externalId === device.external_id ||
      sensor.zones.some((zone) => zone.externalId === device.external_id),
  );
  return value === undefined
    ? { state: 'invalid', reason: 'This sensor is no longer in the plugin inventory.' }
    : { state: 'ready', value, at: stream.at };
}

export async function operatePresence(
  sensor: ShellyPresenceDevice,
  operation: ShellyPresenceAction,
): Promise<ShellyPresenceOutcome> {
  const checked = SHELLY_PRESENCE_ACTION.parse(operation);
  const available = sensor.features.find((feature) => feature.id === checked.action);
  if (available?.available !== true)
    throw new Error(available?.reason ?? 'This device does not advertise this operation.');
  const descriptor = SHELLY_PRESENCE_OPERATIONS.find((item) => item.action === checked.action);
  if (descriptor === undefined) throw new Error(`No operation descriptor for ${checked.action}.`);
  const permission = shellyPresencePermission(checked);
  if (permission === null) throw new Error('This operation has no permitted native tool.');
  const tool =
    permission === 'write' ? 'operate' : permission === 'read' ? 'read' : `operate_${permission}`;
  const outcome = await callPluginTool(SHELLY_PRESENCE_PLUGIN_ID, tool, {
    externalId: sensor.externalId,
    operation: checked,
  });
  return SHELLY_PRESENCE_OUTCOME.parse(outcome.result);
}

export function revisionOf(sensor: ShellyPresenceDevice): { readonly expectedRevision?: number } {
  return sensor.revision === null ? {} : { expectedRevision: sensor.revision };
}
