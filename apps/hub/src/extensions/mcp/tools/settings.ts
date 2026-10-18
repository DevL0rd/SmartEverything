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
  home_name: 'update_settings action home',
  time_zone: 'update_settings action home',
  latitude: 'update_settings action home or location',
  longitude: 'update_settings action home or location',
  public_url: 'call_operation setPublicUrl, then verifyPublicUrl',
  ice_servers: 'call_operation updateNetwork',
  webrtc_candidates: 'call_operation updateNetwork',
  push: 'call_operation setPushAccount or clearPushAccount',
  mcp_disabled_tools: 'update_settings action tools',
  ir_remotes: 'call_operation updateIrRemote (remote ids from get_device or list_remotes)',
  end_of_speech_pause_ms: 'call_operation updateListeningSettings',
  ear_host_device_id: 'call_operation updateListeningSettings',
  device_refills: 'call_operation recordDeviceRefill',
  history_settings: 'call_operation updateHistorySettings',
  location_name: 'update_settings action location',
  fitness_goals: 'edit_person action goals',
  max_heart_rate: 'edit_person action goals',
  push_project_id: 'call_operation setPushAccount or clearPushAccount',
  goals: 'edit_person action goals',
  preferences: 'update_settings action preference',
  layouts: 'call_operation saveLayout (page = home, climate, fitness or cameras)',
  rooms: 'edit_room',
  people: 'edit_person',
  devices:
    'edit_device action device (name, room, hidden, favourite, position, a television’s input_names); device options with control_devices',
  cameras: 'edit_device action camera (save event clips); camera options with control_devices',
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
    name: 'get_settings',
    input: z.strictObject({ personId: PERSON, clientId: CLIENT }),
    annotations: READS,
    run: async (context, input) => ({ structured: await settings(context, input) }),
  }),
  defineTool({
    name: 'set_preference',
    input: z.strictObject({
      preference: z.enum(CLIENT_PREF_KEYS).describe('Which preference; get_settings lists them'),
      value: z
        .record(z.string(), z.unknown())
        .describe('Only the fields to change, with values from get_settings › allowed'),
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
