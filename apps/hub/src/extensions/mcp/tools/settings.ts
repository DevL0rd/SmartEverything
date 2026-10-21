import { CLIENT_PREFS, CLIENT_PREF_KEYS } from '@smarteverything/domain';
import { z } from 'zod';
import { operate, ownerOf, profileFor, type ActingAs } from './acting';
import { readPref, writePref } from './prefs';
import {
  PERSON,
  READS,
  WRITES,
  defineTool,
  jsonSchemaOf,
  type Tool,
  type ToolContext,
} from './registry';

export const CHANGED_BY = {
  home_name: 'settings_edit action home',
  time_zone: 'settings_edit action home',
  latitude: 'settings_edit action home or location',
  longitude: 'settings_edit action home or location',
  public_url: 'operation_call setPublicUrl, then verifyPublicUrl',
  ice_servers: 'operation_call updateNetwork',
  webrtc_candidates: 'operation_call updateNetwork',
  push: 'operation_call setPushAccount or clearPushAccount',
  mcp_disabled_tools: 'settings_edit action tools',
  ir_remotes: 'operation_call updateIrRemote (remote ids from device_read or remote_find)',
  end_of_speech_pause_ms: 'operation_call updateListeningSettings',
  ear_host_device_id: 'operation_call updateListeningSettings',
  device_refills: 'operation_call recordDeviceRefill',
  laundry_notices: 'operation_call updateLaundryNotices',
  history_settings: 'operation_call updateHistorySettings',
  trigger_settings: 'operation_call updateTriggerSettings',
  location_name: 'settings_edit action location',
  fitness_goals: 'person_edit action goals',
  max_heart_rate: 'person_edit action goals',
  push_project_id: 'operation_call setPushAccount or clearPushAccount',
  goals: 'person_edit action goals',
  preferences: 'settings_edit action preference',
  layouts: 'operation_call saveLayout (page = home, climate, fitness or cameras)',
  rooms: 'room_edit',
  people: 'person_edit',
  devices:
    'device_edit action device (name, room, hidden, favourite, position, a television’s input_names and wake_address); device options with device_control',
  cameras: 'device_edit action camera (save event clips); camera options with device_control',
} as const;

const CLIENT = z
  .uuid()
  .optional()
  .describe(
    'For per-app preferences (cameras, health_sync): a paired app id; the desktop when left out',
  );

async function preferences(context: ToolContext, as: ActingAs): Promise<Record<string, unknown>[]> {
  return Promise.all(
    CLIENT_PREF_KEYS.map(async (key) => ({
      key,
      scope: CLIENT_PREFS[key].scope === 'profile' ? 'per person' : 'per paired app',
      value: await readPref(context, key, as),
      allowed: jsonSchemaOf(CLIENT_PREFS[key].schema, 'input'),
    })),
  );
}

async function settings(context: ToolContext, as: ActingAs): Promise<Record<string, unknown>> {
  const owner = ownerOf(context);
  const profileId = profileFor(context, as);
  return {
    home: await operate(context, 'readSettings', {}),
    push: await operate(context, 'readPushStatus', {}),
    person: context.store.profiles.byId(profileId),
    preferences: await preferences(context, as),
    layouts: context.store.personal
      .layouts({ clientId: as.clientId ?? owner.id, profileId })
      .map((row) => row.page),
    changed_by: CHANGED_BY,
  };
}

export const SETTINGS_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'settings_read',
    input: z.strictObject({ personId: PERSON, clientId: CLIENT }),
    annotations: READS,
    run: async (context, input) => ({ structured: await settings(context, input) }),
  }),
  defineTool({
    name: 'set_preference',
    input: z.strictObject({
      preference: z.enum(CLIENT_PREF_KEYS).describe('Which preference; settings_read lists them'),
      value: z
        .record(z.string(), z.unknown())
        .describe('Only the fields to change, with values from settings_read › allowed'),
      personId: PERSON,
      clientId: CLIENT,
    }),
    annotations: { ...WRITES, idempotentHint: true },
    run: async (context, input) => ({
      structured: {
        preference: input.preference,
        value: await writePref(context, input.preference, input.value, input),
      },
    }),
  }),
];
