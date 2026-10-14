import { SHELLY_RESOURCE_ACTIONS as RESOURCE } from '@smarteverything/domain';
import { mappedAction, type ShellyActionMapper } from './action-plan';

export const RESOURCE_PLANS: readonly ShellyActionMapper[] = [
  mappedAction(RESOURCE[0], 'Schedule.Create', (action) => action.schedule),
  mappedAction(RESOURCE[1], 'Schedule.Update', (action) => ({ id: action.id, ...action.schedule })),
  mappedAction(RESOURCE[2], 'Schedule.Delete', (action) => ({ id: action.id })),
  mappedAction(RESOURCE[3], 'Schedule.DeleteAll', () => ({})),
  mappedAction(RESOURCE[4], 'Schedule.Eval', (action) => ({
    timespec: action.timespec,
    now: action.now,
  })),
  mappedAction(RESOURCE[5], 'Webhook.Create', (action) => action.webhook),
  mappedAction(RESOURCE[6], 'Webhook.Update', (action) => ({ id: action.id, ...action.webhook })),
  mappedAction(RESOURCE[7], 'Webhook.Delete', (action) => ({ id: action.id })),
  mappedAction(RESOURCE[8], 'Webhook.DeleteAll', () => ({})),
  mappedAction(RESOURCE[9], 'Script.Create', (action) => ({ name: action.name })),
  mappedAction(RESOURCE[10], 'Script.SetConfig', (action) => ({
    id: action.id,
    config: action.config,
  })),
  mappedAction(RESOURCE[12], 'Script.Start', (action) => ({ id: action.id })),
  mappedAction(RESOURCE[13], 'Script.Stop', (action) => ({ id: action.id })),
  mappedAction(RESOURCE[14], 'Script.Delete', (action) => ({ id: action.id })),
  mappedAction(RESOURCE[15], 'Script.Eval', (action) => ({ id: action.id, code: action.code })),
  mappedAction(RESOURCE[17], 'KVS.Set', (action) => ({
    key: action.key,
    value: action.value,
    etag: action.etag,
  })),
  mappedAction(RESOURCE[18], 'KVS.Delete', (action) => ({ key: action.key, etag: action.etag })),
];
