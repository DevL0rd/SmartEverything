import { AUTOMATION_RUNTIME_ENDPOINTS } from './endpoints-automation-runtime';
import { z } from 'zod';
import { SPEECH_SOURCES } from '../speech-triggers';
import { JSON_VALUE } from '../values';
import { SCENE_ACTIONS } from '../automations';
import { AUTOMATION_V2 } from '../automation-v2-schema';
import { AUTOMATION_RUN_ROW } from '../automation-runs';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, JSON_OBJECT, NOTHING, POSITION, somethingToChange } from './primitives';
import { COMMAND_ROW } from './rows-home';
import {
  AUTOMATION_NAME,
  AUTOMATION_ROW,
  LAYOUT_PAGE_NAME,
  LAYOUT_ROW,
  PUSH_PLATFORMS,
  PUSH_TARGET_ROW,
  PUSH_TOKEN,
  SCENE_NAME,
  SCENE_ROW,
} from './rows-media';

export const AUTOMATION_TOOL_ROW = z.strictObject({
  name: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  description: z.string().max(4000),
  input_schema: JSON_OBJECT,
  read_only: z.boolean(),
  destructive: z.boolean(),
});

export type AutomationToolRow = z.infer<typeof AUTOMATION_TOOL_ROW>;

const SCENE_ICON = z.string().min(1).max(40);
const SCENE_PARAMS = z.strictObject({ sceneId: ID });
const AUTOMATION_PARAMS = z.strictObject({ automationId: ID });
const LAYOUT_PARAMS = z.strictObject({ page: LAYOUT_PAGE_NAME });
const RUN_INPUTS = z.record(z.string(), JSON_VALUE);
const RUN_REQUEST = z
  .strictObject({ inputs: RUN_INPUTS.optional(), wait: z.boolean().optional() })
  .default({});

export const STORED_LAYOUT = z.strictObject({ layout: JSON_OBJECT.nullable() });

const SCENE_ENDPOINTS = {
  listScenes: endpoint({
    method: 'GET',
    path: '/api/scenes',
    access: 'member',
    summary: 'Every scene in order',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(SCENE_ROW),
  }),
  createScene: endpoint({
    method: 'POST',
    path: '/api/scenes',
    access: 'member',
    summary: 'Add a scene',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      name: SCENE_NAME,
      icon: SCENE_ICON.default('sparkles'),
      actions: SCENE_ACTIONS,
      position: POSITION.default(0),
    }),
    response: SCENE_ROW,
  }),
  updateScene: endpoint({
    method: 'PATCH',
    path: '/api/scenes/:sceneId',
    access: 'member',
    summary: 'Change a scene',
    params: SCENE_PARAMS,
    query: NOTHING,
    body: somethingToChange({ name: SCENE_NAME, icon: SCENE_ICON, actions: SCENE_ACTIONS }),
    response: SCENE_ROW,
  }),
  orderScenes: endpoint({
    method: 'PUT',
    path: '/api/scenes/order',
    access: 'member',
    summary: 'Put the scenes in the given order',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ ids: z.array(ID).min(1) }),
    response: z.array(SCENE_ROW),
  }),
  removeScene: endpoint({
    method: 'DELETE',
    path: '/api/scenes/:sceneId',
    access: 'member',
    summary: 'Delete a scene',
    params: SCENE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  runScene: endpoint({
    method: 'POST',
    path: '/api/scenes/:sceneId/run',
    access: 'member',
    summary: 'Send every action of a scene as a command with source scene',
    params: SCENE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(COMMAND_ROW),
  }),
} as const;

const AUTOMATION_ENDPOINTS = {
  listSpeechSources: endpoint({
    method: 'GET',
    path: '/api/automations/speech-sources',
    access: 'member',
    summary:
      'Readable finalized-speech sources for literal word or contiguous phrase automation triggers; global means these authorized sources, images and mixed video notes are unavailable',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: SPEECH_SOURCES,
  }),
  listAutomations: endpoint({
    method: 'GET',
    path: '/api/automations',
    access: 'member',
    summary: 'Every automation by name',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(AUTOMATION_ROW),
  }),
  createAutomation: endpoint({
    method: 'POST',
    path: '/api/automations',
    access: 'member',
    summary:
      'Add an automation: when (triggers), onlyIf (one condition), steps and optional inputs and run mode. An automation without triggers is only started by hand or by another automation. Speech triggers match literal finalized words or contiguous phrases from currently authorized sources, with bot speech excluded by default',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      name: AUTOMATION_NAME,
      enabled: z.boolean().default(true),
      definition: AUTOMATION_V2,
    }),
    response: AUTOMATION_ROW,
  }),
  updateAutomation: endpoint({
    method: 'PATCH',
    path: '/api/automations/:automationId',
    access: 'member',
    summary:
      'Change, enable or pause an automation; a new definition clears its last error. expectedRevision is optional and refuses the save when the automation changed since it was read',
    params: AUTOMATION_PARAMS,
    query: NOTHING,
    body: somethingToChange({
      name: AUTOMATION_NAME,
      enabled: z.boolean(),
      definition: AUTOMATION_V2,
      expectedRevision: z.int().positive(),
    }),
    response: AUTOMATION_ROW,
  }),
  removeAutomation: endpoint({
    method: 'DELETE',
    path: '/api/automations/:automationId',
    access: 'member',
    summary: 'Delete an automation that no other automation runs',
    params: AUTOMATION_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  runAutomation: endpoint({
    method: 'POST',
    path: '/api/automations/:automationId/run',
    access: 'member',
    summary:
      'Run an automation’s steps now, skipping its triggers and onlyIf; the run is recorded like any other. With wait the reply comes when the run has finished',
    params: AUTOMATION_PARAMS,
    query: NOTHING,
    body: RUN_REQUEST,
    response: AUTOMATION_RUN_ROW,
  }),
  listAutomationTools: endpoint({
    method: 'GET',
    path: '/api/automations/tools',
    access: 'owner',
    summary:
      'Every tool a tool step can call, with its exact input schema; the same tools the AI uses',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(AUTOMATION_TOOL_ROW),
  }),
  testAutomation: endpoint({
    method: 'POST',
    path: '/api/automations/test',
    access: 'member',
    summary:
      'Run an unsaved draft on the hub as a real run, skipping its triggers and onlyIf; nothing is saved. With wait the reply comes when the run has finished',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      automationId: ID.optional(),
      definition: AUTOMATION_V2,
      inputs: RUN_INPUTS.optional(),
      wait: z.boolean().optional(),
    }),
    response: AUTOMATION_RUN_ROW,
  }),
} as const;

const CLIENT_ENDPOINTS = {
  readLayout: endpoint({
    method: 'GET',
    path: '/api/layouts/:page',
    access: 'member',
    summary: 'The calling client’s saved layout or setting for a page',
    params: LAYOUT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: STORED_LAYOUT,
  }),
  saveLayout: endpoint({
    method: 'PUT',
    path: '/api/layouts/:page',
    access: 'member',
    summary: 'Save the calling client’s layout or setting for a page',
    params: LAYOUT_PARAMS,
    query: NOTHING,
    body: z.strictObject({ layout: JSON_OBJECT }),
    response: LAYOUT_ROW,
  }),
  listPushTargets: endpoint({
    method: 'GET',
    path: '/api/push-targets',
    access: 'owner',
    summary: 'Every phone registered for push notifications',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PUSH_TARGET_ROW),
  }),
  savePushTarget: endpoint({
    method: 'PUT',
    path: '/api/push-targets',
    access: 'member',
    summary: 'Register the calling phone’s Firebase token',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ token: PUSH_TOKEN, platform: z.enum(PUSH_PLATFORMS) }),
    response: PUSH_TARGET_ROW,
  }),
  removePushTarget: endpoint({
    method: 'DELETE',
    path: '/api/push-targets',
    access: 'member',
    summary: 'Forget a Firebase token of the calling phone',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ token: PUSH_TOKEN }),
    response: DONE,
  }),
} as const;

export const AUTOMATION_AREA_ENDPOINTS = {
  ...AUTOMATION_RUNTIME_ENDPOINTS,
  ...SCENE_ENDPOINTS,
  ...AUTOMATION_ENDPOINTS,
  ...CLIENT_ENDPOINTS,
} as const;
