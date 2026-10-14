import { SHELLY_ADVANCED_ACTIONS as EXTRA } from '@smarteverything/domain';
import { type ShellyPresenceAction, SHELLY_DYNAMIC_ACTIONS as A } from '@smarteverything/domain';
import {
  mappedAction,
  rpcPlan,
  type ShellyActionPlan,
  type ShellyActionMapper,
} from './action-plan';
const NAMES = {
  boolean: 'Boolean',
  number: 'Number',
  enum: 'Enum',
  text: 'Text',
  button: 'Button',
  group: 'Group',
} as const;
export const DYNAMIC_PLANS: readonly ShellyActionMapper[] = [
  mappedAction(EXTRA[9], 'KVS.Get', (a) => ({ key: a.key })),
  mappedAction(EXTRA[10], 'KVS.List', (a) => ({ match: a.match, offset: a.offset })),
  mappedAction(EXTRA[11], 'KVS.GetMany', (a) => ({ match: a.match, offset: a.offset })),
  mappedAction(EXTRA[5], 'Shelly.ListAlternatives', () => ({})),
  mappedAction(EXTRA[6], 'Shelly.SetAlternative', (a) => ({ name: a.name })),
  mappedAction(EXTRA[7], 'Shelly.InstallAlt', (a) => ({ app: a.app, stage: a.stage })),
  mappedAction(EXTRA[8], 'Boolean.Toggle', (a) => ({ id: a.id })),
  mappedAction(A[0], 'Virtual.Add', (a) => ({
    type: a.config.component,
    config: a.config.value,
    id: a.id,
  })),
  mappedAction(A[1], 'Virtual.Delete', (a) => ({ key: a.key })),
  (a: ShellyPresenceAction): ShellyActionPlan | null =>
    a.action === 'virtual_config'
      ? rpcPlan(`${NAMES[a.config.component]}.SetConfig`, { id: a.id, config: a.config.value })
      : null,
  (a: ShellyPresenceAction): ShellyActionPlan | null =>
    a.action === 'virtual_set'
      ? rpcPlan(`${NAMES[a.setting.component]}.Set`, { id: a.id, value: a.setting.value })
      : null,
  mappedAction(A[4], 'Button.Trigger', (a) => ({ id: a.id, event: a.event })),
  mappedAction(A[5], 'BTHome.StartDeviceDiscovery', (a) => ({ duration: a.duration })),
  mappedAction(A[6], 'BTHome.GetObjectInfos', (a) => ({ obj_ids: a.obj_ids, offset: a.offset })),
  mappedAction(A[7], 'BTHome.AddDevice', (a) => ({ config: a.config, id: a.id })),
  mappedAction(A[8], 'BTHome.DeleteDevice', (a) => ({ id: a.id })),
  mappedAction(A[9], 'BTHomeDevice.SetConfig', (a) => ({ id: a.id, config: a.config })),
  mappedAction(A[10], 'BTHomeDevice.GetKnownObjects', (a) => ({ id: a.id })),
  mappedAction(A[11], 'BTHome.AddSensor', (a) => ({
    id: a.id,
    config: { ...a.config, obj_idx: a.config.idx, idx: undefined },
  })),
  mappedAction(A[12], 'BTHome.DeleteSensor', (a) => ({ id: a.id })),
  mappedAction(A[13], 'BTHomeSensor.SetConfig', (a) => ({ id: a.id, config: a.config })),
  mappedAction(A[14], 'BTHome.ResetEncryptionCounter', () => ({})),
  mappedAction(A[15], 'BTHome.SetConfig', (a) => ({ config: a.config })),
  mappedAction(A[16], 'Presence.Restart', () => ({})),
];
