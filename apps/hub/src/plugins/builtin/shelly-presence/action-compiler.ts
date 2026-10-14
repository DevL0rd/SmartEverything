import { httpActionPlan } from './http-action-plan';
import {
  ApiError,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
import { CORE_PLANS, componentActionPlan, rpcPlan, type ShellyActionPlan } from './action-plan';
import { RESOURCE_PLANS } from './action-resource-plan';
import { MANAGEMENT_PLANS } from './action-management-plan';
import { DYNAMIC_PLANS } from './action-dynamic-plan';
import { zoneWriteConfig } from './action-rules';
export function compileShellyAction(
  snapshot: ShellyPresenceDevice,
  action: ShellyPresenceAction,
): ShellyActionPlan {
  const http = httpActionPlan(snapshot, action);
  if (http !== null) return http;
  if (action.action === 'live_track')
    return rpcPlan(
      'Presence.LiveTrack',
      snapshot.info.ver.includes('presenceg4prod') ? { enable: true } : {},
    );
  if (action.action === 'set_zone')
    return rpcPlan('PresenceZone.SetConfig', {
      id: action.id,
      config: zoneWriteConfig(snapshot, action),
    });
  if (action.action === 'device_reset' && action.target === 'wifi')
    return rpcPlan('Shelly.ResetWiFiConfig', {});
  const mappers = [
    ...CORE_PLANS,
    componentActionPlan,
    ...RESOURCE_PLANS,
    ...MANAGEMENT_PLANS,
    ...DYNAMIC_PLANS,
  ];
  for (const mapper of mappers) {
    const plan = mapper(action);
    if (plan !== null) return plan;
  }
  throw new ApiError(
    'command_refused',
    'This typed operation is not supported by the installed handler.',
  );
}
