import { shellyScheduledActions } from './shelly-presence-schedule-actions';
import type { ShellyPresenceAction } from './shelly-presence-actions';
import { SHELLY_PRESENCE_OPERATIONS } from './shelly-presence-catalogue';
import type { ShellyPresenceField } from './shelly-presence-fields';
export function shellyPresencePermission(
  action: ShellyPresenceAction,
): ShellyPresenceField['permission'] | null {
  if (action.action === 'set_component' && opensAccess(action.config)) return 'access';
  if (
    (action.action === 'bthome_device_config' || action.action === 'bthome_add_device') &&
    action.config.key !== undefined
  )
    return 'access';
  const own =
    SHELLY_PRESENCE_OPERATIONS.find((operation) => operation.action === action.action)
      ?.permission ?? null;
  if (own === null) return null;
  return shellyScheduledActions(action).reduce<ShellyPresenceField['permission'] | null>(
    (permission, nested) => strongerPermission(permission, shellyPresencePermission(nested)),
    own,
  );
}
function opensAccess(
  config: Extract<ShellyPresenceAction, { action: 'set_component' }>['config'],
): boolean {
  if (config.component === 'wifi') return config.value.ap?.enable === true;
  if (config.component === 'ble') return bleAccess(config.value.rpc);
  if (config.component === 'sys') return udpAccess(config.value.rpc_udp?.listen_port);
  return false;
}
function bleAccess(
  rpc:
    | { readonly enable?: boolean | undefined; readonly keep_running?: boolean | undefined }
    | undefined,
): boolean {
  return rpc?.enable === true || rpc?.keep_running === true;
}
function udpAccess(port: number | null | undefined): boolean {
  return port !== undefined && port !== null;
}

const PERMISSION_RANK = { read: 0, write: 1, privileged: 2, destructive: 3, access: 4 } as const;
function strongerPermission(
  left: ShellyPresenceField['permission'] | null,
  right: ShellyPresenceField['permission'] | null,
): ShellyPresenceField['permission'] | null {
  if (left === null || right === null) return null;
  return PERMISSION_RANK[right] > PERMISSION_RANK[left] ? right : left;
}
