import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { ShellyAction } from '@smarteverything/shelly';
import { READ_HANDLERS } from './device-reads';
import type { OperationHandler, OperationPorts } from './ports';
import type { ShellyResource } from './resources';
import { startLiveTrack } from './tracking';
import { TRANSFER_HANDLERS } from './transfers';
import { shellyCall, type ShellyParams } from './wire';

export interface ShellyRequest {
  readonly action: ShellyAction;
  readonly params: ShellyParams;
  readonly expectedRevision?: number | undefined;
}

export type ShellyOutcome =
  | {
      readonly state: 'accepted';
      readonly action: ShellyAction;
      readonly result: JsonValue;
      readonly restartRequired: boolean;
      readonly revision: number | null;
      readonly confirmed?: boolean;
    }
  | { readonly state: 'unknown'; readonly action: ShellyAction; readonly message: string };

const HANDLERS: Partial<Record<ShellyAction, OperationHandler>> = {
  ...TRANSFER_HANDLERS,
  ...READ_HANDLERS,
  refresh: async (ports) => {
    await ports.refresh();
    return null;
  },
  reconnect: async (ports) => {
    await ports.reconnect();
    return null;
  },
  live_track: (ports) => startLiveTrack(ports.call),
};

const WITHOUT_CONFIRMATION: ReadonlySet<ShellyAction> = new Set([
  'refresh',
  'reconnect',
  'script_library',
  'script_example',
  'device_logs',
  'device_log_files',
  'device_log_file',
  'firmware_upload_start',
  'firmware_upload_write',
  'firmware_upload_abort',
]);

const WRITES: Partial<Record<ShellyAction, ShellyResource>> = {
  schedule_create: 'schedules',
  schedule_update: 'schedules',
  schedule_delete: 'schedules',
  schedule_delete_all: 'schedules',
  webhook_create: 'webhooks',
  webhook_update: 'webhooks',
  webhook_delete: 'webhooks',
  webhook_delete_all: 'webhooks',
  script_create: 'scripts',
  script_config: 'scripts',
  script_put_code: 'scripts',
  script_start: 'scripts',
  script_stop: 'scripts',
  script_delete: 'scripts',
  kvs_set: 'storedValues',
  kvs_delete: 'storedValues',
};

export function writtenResource(action: ShellyAction): ShellyResource | undefined {
  return WRITES[action];
}

export function confirmsAfter(action: ShellyAction): boolean {
  return !WITHOUT_CONFIRMATION.has(action);
}

export function runShellyAction(
  ports: OperationPorts,
  action: ShellyAction,
  params: ShellyParams,
): Promise<JsonValue> {
  const handler = HANDLERS[action];
  if (handler !== undefined) return handler(ports, params);
  const call = shellyCall(action, params, ports.device());
  return ports.call(call.method, call.params, JSON_VALUE);
}
