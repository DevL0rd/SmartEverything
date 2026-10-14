import type { ShellyPresenceAction } from './shelly-presence-actions';
import type { ShellyScheduleCall } from './shelly-presence-resources';
export function shellyScheduledActions(
  action: ShellyPresenceAction,
): readonly ShellyPresenceAction[] {
  if (action.action !== 'schedule_create' && action.action !== 'schedule_update') return [];
  return action.schedule.calls?.map(scheduledAction) ?? [];
}
function scheduledAction(call: ShellyScheduleCall): ShellyPresenceAction {
  if (
    call.method === 'WiFi.SetConfig' ||
    call.method === 'MQTT.SetConfig' ||
    call.method === 'Sys.SetConfig'
  )
    return scheduledSystemAction(call);
  return scheduledControlAction(call);
}
function scheduledControlAction(
  call: Exclude<
    ShellyScheduleCall,
    { method: 'WiFi.SetConfig' | 'MQTT.SetConfig' | 'Sys.SetConfig' }
  >,
): ShellyPresenceAction {
  switch (call.method) {
    case 'Presence.SetSensor':
      return { action: 'set_detection', enable: call.params.enable };
    case 'Presence.SetConfig':
      return { action: 'set_presence', config: call.params.config };
    case 'PresenceZone.SetConfig':
      return { action: 'set_zone', id: call.params.id, config: call.params.config };
    case 'Illuminance.SetConfig':
      return { action: 'set_light', id: call.params.id, config: call.params.config };
    case 'Shelly.Reboot':
      return { action: 'device_reboot', ...call.params };
    case 'Script.Start':
      return { action: 'script_start', id: call.params.id };
    case 'Script.Stop':
      return { action: 'script_stop', id: call.params.id };
  }
}

function scheduledSystemAction(
  call: Extract<
    ShellyScheduleCall,
    { method: 'WiFi.SetConfig' | 'MQTT.SetConfig' | 'Sys.SetConfig' }
  >,
): ShellyPresenceAction {
  switch (call.method) {
    case 'WiFi.SetConfig':
      return { action: 'set_component', config: { component: 'wifi', value: call.params.config } };
    case 'MQTT.SetConfig':
      return { action: 'set_component', config: { component: 'mqtt', value: call.params.config } };
    case 'Sys.SetConfig':
      return { action: 'set_component', config: { component: 'sys', value: call.params.config } };
  }
}
