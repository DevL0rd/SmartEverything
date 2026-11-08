import {
  phoneTierOf,
  phoneValueHidden,
  type JsonValue,
  type PhoneTier,
} from '@smarteverything/domain';
import { z } from 'zod';
import { currentExecutionAuthority, executionRole } from '../../assistant/turn-authority';
import type { WorldReadDeps } from './deps';
import { parseInputs } from './inputs';
import { ReadFailure, outputsOf, type ReadHandlers, type ReadResult } from './read-port';

const PHONE = z.object({
  phone: z.union([
    z.string().min(1),
    z.strictObject({ phone: z.string().min(1) }).transform((ref) => ref.phone),
  ]),
});

const READINGS: Readonly<Record<string, string>> = {
  battery: 'battery',
  charging: 'charging',
  ringerMode: 'ringer_mode',
  dnd: 'dnd',
  screenOn: 'screen_on',
  context: 'phone_context',
  network: 'network',
  wifiOn: 'wifi_on',
  bluetoothOn: 'bluetooth_on',
  locationOn: 'location_on',
  airplane: 'airplane_mode',
  notificationCount: 'notification_count',
  nextAlarm: 'next_alarm',
  nowPlaying: 'now_playing',
  screenTimeToday: 'screen_time_today',
  inCall: 'in_call',
  ringing: 'ringing',
  powerSave: 'power_save',
  thermal: 'thermal_state',
};

function tierOf(profileId: string | undefined): PhoneTier {
  const authority = currentExecutionAuthority();
  if (authority === undefined) return 'person';
  return phoneTierOf({
    phoneProfileId: profileId ?? '',
    viewerProfileId: authority.profile_id,
    viewerRole: executionRole(authority),
  });
}

function phoneRead(deps: WorldReadDeps, deviceId: string): ReadResult {
  if (deps.store.devices.find(deviceId) === undefined) {
    throw new ReadFailure('NotFound', `There is no device ${deviceId}`);
  }
  const context = deps.store.phoneContexts.byDevice(deviceId);
  const tier = tierOf(context?.profileId);
  const readings: Record<string, JsonValue | undefined> = {};
  for (const [output, capability] of Object.entries(READINGS)) {
    if (!phoneValueHidden(capability, tier)) {
      readings[output] = deps.observed(deviceId, capability) ?? undefined;
    }
  }
  if (!phoneValueHidden('place', tier)) readings['place'] = context?.place ?? undefined;
  return outputsOf(readings);
}

export function phoneReadHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'phone.read': (inputs): ReadResult => {
      const { phone } = parseInputs('phone.read', PHONE, inputs);
      return phoneRead(deps, phone);
    },
  };
}
