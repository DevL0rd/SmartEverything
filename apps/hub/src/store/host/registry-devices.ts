import { NOTE_AUTOMATION_RUN_UNIT, RECORD_RUN_SLICE_UNIT } from '../../automations/run-units';
import { CLAIM_COMMAND_UNIT, INSERT_COMMANDS_UNIT } from '../../commands/command-units';
import { INTERRUPT_DEVICE_EFFECT_UNIT } from '../../commands/effect-units';
import { SET_GOOGLE_CHANNEL_UNIT, SETTLE_GOOGLE_SYNC_UNIT } from '../../google/google-units';
import { PHONE_CONTEXT_UNIT } from '../../phones/phone-units';
import { CREATE_SCHEDULE_UNIT, UPDATE_SCHEDULE_UNIT } from '../../schedules/schedule-units';
import {
  AUTOMATION_AUTHOR_UNIT,
  AUTOMATION_CALLEES_UNIT,
  AUTOMATION_CHAT_UNIT,
  AUTOMATION_MEMORY_UNIT,
  AUTOMATION_STORED_PLANS_UNIT,
  BOOT_AUTOMATION_RUNS_UNIT,
  PREPARE_AUTOMATION_UNIT,
} from '../../automations/engine-units';
import { APPLY_HOME_VALUE_UNIT } from '../../automations/effects/value-ops';
import {
  ADMITTED_DEVICE_MEMBERS_UNIT,
  PREPARE_TARGET_COMMANDS_UNIT,
  STEPPED_DEVICE_PLAN_UNIT,
} from '../../automations/effects/device-units';
import { WORLD_MIRROR_UNIT } from '../../automations/world-v3/world-units';
import { AUTOMATION_FUNCTION_BODIES_UNIT } from '../../automations/automation-units';
import {
  MIGRATE_PLUGIN_KINDS_UNIT,
  PERSIST_PLUGIN_KINDS_UNIT,
} from '../../automations/plugin-kinds/kind-units';
import {
  APPLY_HOME_MAPS_UNIT,
  CREATE_HOME_MAP_UNIT,
  HOME_MAP_DEVICE_MODELS_UNIT,
  HOME_MAP_REVISIONS_UNIT,
  HOME_MAP_VIEW_UNIT,
  REMOVE_HOME_MAP_UNIT,
  SAVE_HOME_MAP_VERSION_UNIT,
  UPDATE_HOME_MAP_UNIT,
} from '../../home-map/map-units';
import { storeUnit } from './unit';
import { PHONE_DETAIL_ROWS_UNIT } from '../../phones/phone-units';
import {
  IR_ASSUMED_PRESS_UNIT,
  IR_REMOTE_GOAL_UNIT,
  IR_REMOTE_SENT_UNIT,
  REMOVE_IR_APPLIANCE_UNIT,
} from '../../infrared/ir-units';
import {
  REACH_CHANNEL_MEMBER_UNIT,
  REACH_CLIENTS_UNIT,
  REACH_DEVICE_TARGET_UNIT,
  REACH_PRESENCE_UNIT,
  REACH_PUSH_TARGETS_UNIT,
  REACH_SPEECH_TEXT_UNIT,
  RETIRE_OUTREACH_UNIT,
} from '../../reach/reach-units';

const HOST_PING_UNIT = storeUnit((_store, _input: null): null => null);

const ENGINE_READ_UNITS = {
  hostPing: HOST_PING_UNIT,
  admittedDeviceMembers: ADMITTED_DEVICE_MEMBERS_UNIT,
  automationAuthor: AUTOMATION_AUTHOR_UNIT,
  automationCallees: AUTOMATION_CALLEES_UNIT,
  automationStoredPlans: AUTOMATION_STORED_PLANS_UNIT,
} as const;

const AUTOMATION_WORLD_READ_UNITS = {
  worldMirror: WORLD_MIRROR_UNIT,
  automationFunctionBodies: AUTOMATION_FUNCTION_BODIES_UNIT,
} as const;

const AUTOMATION_WORLD_WRITE_UNITS = {
  persistPluginKinds: PERSIST_PLUGIN_KINDS_UNIT,
  migratePluginKinds: MIGRATE_PLUGIN_KINDS_UNIT,
} as const;

const ENGINE_WRITE_UNITS = {
  settleGoogleSync: SETTLE_GOOGLE_SYNC_UNIT,
  phoneContext: PHONE_CONTEXT_UNIT,
  createSchedule: CREATE_SCHEDULE_UNIT,
  updateSchedule: UPDATE_SCHEDULE_UNIT,
  prepareTargetCommands: PREPARE_TARGET_COMMANDS_UNIT,
  steppedDevicePlan: STEPPED_DEVICE_PLAN_UNIT,
  applyHomeValue: APPLY_HOME_VALUE_UNIT,
  automationChat: AUTOMATION_CHAT_UNIT,
  automationMemory: AUTOMATION_MEMORY_UNIT,
  bootAutomationRuns: BOOT_AUTOMATION_RUNS_UNIT,
  prepareAutomation: PREPARE_AUTOMATION_UNIT,
} as const;

const HOME_EDGE_READ_UNITS = {
  settingsRow: storeUnit((store, _input: null) => store.settings.read()),
  phoneDetailRows: PHONE_DETAIL_ROWS_UNIT,
  reachClients: REACH_CLIENTS_UNIT,
  reachPresence: REACH_PRESENCE_UNIT,
  reachDeviceTarget: REACH_DEVICE_TARGET_UNIT,
  reachChannelMember: REACH_CHANNEL_MEMBER_UNIT,
  reachSpeechText: REACH_SPEECH_TEXT_UNIT,
  reachPushTargets: REACH_PUSH_TARGETS_UNIT,
} as const;

const HOME_EDGE_WRITE_UNITS = {
  retireOutreach: RETIRE_OUTREACH_UNIT,
  irAssumedPress: IR_ASSUMED_PRESS_UNIT,
  irRemoteSent: IR_REMOTE_SENT_UNIT,
  irRemoteGoal: IR_REMOTE_GOAL_UNIT,
  removeIrAppliance: REMOVE_IR_APPLIANCE_UNIT,
} as const;

const HOME_MAP_READ_UNITS = {
  homeMapView: HOME_MAP_VIEW_UNIT,
  homeMapRevisions: HOME_MAP_REVISIONS_UNIT,
  homeMapDeviceModels: HOME_MAP_DEVICE_MODELS_UNIT,
} as const;

const HOME_MAP_WRITE_UNITS = {
  applyHomeMaps: APPLY_HOME_MAPS_UNIT,
  createHomeMap: CREATE_HOME_MAP_UNIT,
  updateHomeMap: UPDATE_HOME_MAP_UNIT,
  removeHomeMap: REMOVE_HOME_MAP_UNIT,
  saveHomeMapVersion: SAVE_HOME_MAP_VERSION_UNIT,
} as const;

export const DEVICES_READ_UNITS = {
  ...ENGINE_READ_UNITS,
  ...AUTOMATION_WORLD_READ_UNITS,
  ...HOME_EDGE_READ_UNITS,
  ...HOME_MAP_READ_UNITS,
} as const;

export const DEVICES_WRITE_UNITS = {
  claimCommand: CLAIM_COMMAND_UNIT,
  insertCommands: INSERT_COMMANDS_UNIT,
  interruptDeviceEffect: INTERRUPT_DEVICE_EFFECT_UNIT,
  noteAutomationRun: NOTE_AUTOMATION_RUN_UNIT,
  recordRunSlice: RECORD_RUN_SLICE_UNIT,
  setGoogleChannel: SET_GOOGLE_CHANNEL_UNIT,
  ...ENGINE_WRITE_UNITS,
  ...AUTOMATION_WORLD_WRITE_UNITS,
  ...HOME_EDGE_WRITE_UNITS,
  ...HOME_MAP_WRITE_UNITS,
} as const;
