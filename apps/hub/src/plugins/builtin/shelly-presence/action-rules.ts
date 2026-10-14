import { validateShellyValues } from './action-validation';
import { validateShellySecurity } from './security';
import {
  ApiError,
  shellyPresencePermission,
  shellyScheduledActions,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';

export function shellyActionPermission(
  action: ShellyPresenceAction,
): 'read' | 'write' | 'privileged' | 'destructive' | 'access' {
  const permission = shellyPresencePermission(action);
  if (permission === null)
    throw new ApiError(
      'command_refused',
      'This Shelly operation has no implemented permission descriptor.',
    );
  return permission;
}
export function validateShellyAction(
  snapshot: ShellyPresenceDevice,
  action: ShellyPresenceAction,
): void {
  if (snapshot.connection.state !== 'online')
    throw new ApiError('conflict', 'The sensor is offline. Reconnect before changing settings.');
  if (
    'expectedRevision' in action &&
    action.expectedRevision !== undefined &&
    action.expectedRevision !== actionRevision(snapshot, action)
  )
    throw new ApiError(
      'conflict',
      'The sensor configuration changed. Reload the accepted settings before saving.',
    );
  for (const nested of shellyScheduledActions(action)) validateShellyAction(snapshot, nested);
  validateResourceReplacement(snapshot, action);
  validateShellySecurity(snapshot, action);
  validateShellyValues(snapshot, action);
  validateZoneAction(snapshot, action);
  validatePresetAction(snapshot, action);
}
function validateZoneAction(snapshot: ShellyPresenceDevice, action: ShellyPresenceAction): void {
  if (action.action === 'add_zone') {
    if (snapshot.zones.length >= 10)
      throw new ApiError(
        'command_refused',
        'This sensor already has its maximum of 10 zones, including the main zone.',
      );
    return;
  }
  if (action.action !== 'delete_zone' && action.action !== 'set_zone') return;
  const zone = snapshot.zones.find((candidate) => candidate.config.id === action.id);
  if (zone === undefined) throw new ApiError('not_found', 'That zone no longer exists.');
  if (!zone.main) return;
  if (action.action === 'delete_zone')
    throw new ApiError('command_refused', 'The main room zone cannot be deleted.');
  if (action.config.name !== undefined && action.config.name !== zone.config.name)
    throw new ApiError('command_refused', 'The main room zone name is read-only.');
}
function validatePresetAction(snapshot: ShellyPresenceDevice, action: ShellyPresenceAction): void {
  if (action.action !== 'set_presence') return;
  const current = snapshot.config;
  if (action.config.num_tracks !== undefined && current?.num_tracks === undefined)
    throw new ApiError('command_refused', 'This firmware does not expose a track limit setting.');
  const sensor = action.config.sensor;
  if (sensor === undefined) return;
  validateSensorPreset(current?.sensor, sensor);
}
function validateSensorPreset(
  current: { readonly room_preset?: string | undefined } | undefined,
  sensor: { readonly room_preset?: string | undefined },
): void {
  if (sensor.room_preset !== undefined && current?.room_preset === undefined)
    throw new ApiError('command_refused', 'This firmware does not expose room presets.');
  if (current?.room_preset !== 'small_room' || sensor.room_preset === 'default') return;
  if (Object.keys(sensor).some((key) => key !== 'room_preset'))
    throw new ApiError(
      'command_refused',
      'Switch the small-room preset to default before changing its locked tuning.',
    );
}
export function zoneWriteConfig(
  snapshot: ShellyPresenceDevice,
  action: Extract<ShellyPresenceAction, { action: 'set_zone' }>,
): Readonly<Record<string, unknown>> {
  const zone = snapshot.zones.find((candidate) => candidate.config.id === action.id);
  if (zone === undefined) throw new ApiError('not_found', 'That zone no longer exists.');
  const { presence_delay, absence_delay, ...rest } = action.config;
  const presenceKey = zone.config.presence_thr === undefined ? 'presence_delay' : 'presence_thr';
  const absenceKey = zone.config.absence_thr === undefined ? 'absence_delay' : 'absence_thr';
  return {
    ...rest,
    ...(presence_delay === undefined ? {} : { [presenceKey]: presence_delay }),
    ...(absence_delay === undefined ? {} : { [absenceKey]: absence_delay }),
  };
}

function actionRevision(
  snapshot: ShellyPresenceDevice,
  action: ShellyPresenceAction,
): number | null | undefined {
  if (action.action.startsWith('schedule_')) return snapshot.resources?.schedules?.rev;
  if (action.action.startsWith('webhook_')) return snapshot.resources?.webhooks?.rev;
  return snapshot.revision;
}

function validateResourceReplacement(
  snapshot: ShellyPresenceDevice,
  action: ShellyPresenceAction,
): void {
  if (action.action === 'schedule_update') validateScheduleReplacement(snapshot, action);
  if (action.action === 'webhook_update') validateWebhookReplacement(snapshot, action);
}
function validateScheduleReplacement(
  snapshot: ShellyPresenceDevice,
  action: Extract<ShellyPresenceAction, { action: 'schedule_update' }>,
): void {
  if (action.schedule.calls === undefined) return;
  const row = snapshot.resources?.schedules?.jobs.find((job) => job.id === action.id);
  if (row !== undefined && row.unavailableCalls.length > 0)
    throw new ApiError(
      'command_refused',
      'This schedule contains unsupported or private calls. Change its time or enable state without replacing its calls, or create a new typed schedule.',
    );
}
function validateWebhookReplacement(
  snapshot: ShellyPresenceDevice,
  action: Extract<ShellyPresenceAction, { action: 'webhook_update' }>,
): void {
  if (action.webhook.urls === undefined) return;
  const row = snapshot.resources?.webhooks?.hooks.find((hook) => hook.id === action.id);
  if (
    row?.destinationsRedacted === true &&
    JSON.stringify(row.urls) === JSON.stringify(action.webhook.urls)
  )
    throw new ApiError(
      'command_refused',
      'These destinations contain private credentials. Enter replacement destinations explicitly before saving them.',
    );
}
