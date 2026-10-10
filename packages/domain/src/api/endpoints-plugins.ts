import { z } from 'zod';
import { INBOUND_MESSAGE, PLUGIN_DATA_POINT, PLUGIN_ID, PLUGIN_ROW } from '../plugins';
import { JSON_VALUE } from '../values';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, MOMENT, NOTHING, queryLimit } from './primitives';

const PLUGIN_PARAMS = z.strictObject({ pluginId: PLUGIN_ID });

const TOOL_NAME = z.string().min(1).max(120);

const TOOL_PARAMS = z.strictObject({ pluginId: PLUGIN_ID, tool: TOOL_NAME });

const DATA_QUERY = z.strictObject({
  stream: z.string().min(1).max(80).optional(),
  limit: queryLimit(1, 200),
});

export const PLUGIN_TOOL_CALL = z.strictObject({
  arguments: z.record(z.string(), z.unknown()).default({}),
  confirm: z.boolean().default(false).describe('true once the person confirmed this action'),
});

export const PLUGIN_TOOL_OUTCOME = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('done'), result: z.record(z.string(), z.unknown()) }),
  z.strictObject({ outcome: z.literal('needs_confirmation'), reason: z.string() }),
]);

export type PluginToolOutcome = z.infer<typeof PLUGIN_TOOL_OUTCOME>;

export const PLUGIN_SEARCH_HIT = z.strictObject({
  id: z.string().min(1).max(260),
  plugin_id: PLUGIN_ID,
  title: z.string().min(1).max(80),
  subtitle: z.string().max(120).nullable(),
  keywords: z.array(z.string()),
  path: z.string().min(1).max(600),
});

export type PluginSearchHit = z.infer<typeof PLUGIN_SEARCH_HIT>;

export const PLUGIN_INSTALL = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('url'), url: z.url({ protocol: /^https?$/ }) }),
  z.strictObject({ source: z.literal('local'), path: z.string().min(1).max(1000) }),
]);

export type PluginInstall = z.infer<typeof PLUGIN_INSTALL>;

export const PLUGIN_CHANGE = z
  .strictObject({
    enabled: z.boolean().optional(),
    trusted: z.boolean().optional(),
    tool_switches: z.record(z.string().min(1).max(120), z.boolean()).optional(),
    settings: z.record(z.string().min(1).max(80), JSON_VALUE).optional(),
    confirm: z.boolean().default(false).describe('true once the person confirmed the powers'),
  })
  .refine(
    (change) =>
      change.enabled !== undefined ||
      change.trusted !== undefined ||
      change.tool_switches !== undefined ||
      change.settings !== undefined,
    { message: 'Change at least one of enabled, trusted, tool_switches or settings' },
  );

export const PLUGIN_TOOL_ROW = z.strictObject({
  name: TOOL_NAME,
  title: z.string().min(1).max(200),
  description: z.string().max(4000),
  read_only: z.boolean(),
  destructive: z.boolean(),
  human_only: z.boolean(),
  enabled: z.boolean(),
});

export type PluginToolRow = z.infer<typeof PLUGIN_TOOL_ROW>;

export const PLUGIN_LOG_LINE = z.strictObject({ at: MOMENT, line: z.string().max(4000) });

export type PluginLogLine = z.infer<typeof PLUGIN_LOG_LINE>;

export const PLUGIN_SAVED = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('saved'), plugin: PLUGIN_ROW }),
  z.strictObject({
    outcome: z.literal('needs_confirmation'),
    reason: z.string(),
    powers: z.array(z.string()).min(1),
  }),
]);

export type PluginSaved = z.infer<typeof PLUGIN_SAVED>;

export const PLUGIN_ENDPOINTS = {
  listPlugins: endpoint({
    method: 'GET',
    path: '/api/plugins',
    access: 'owner',
    summary: 'Installed plugins with their status, powers and settings',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PLUGIN_ROW),
  }),
  installPlugin: endpoint({
    method: 'POST',
    path: '/api/plugins',
    access: 'owner',
    summary:
      'Add a plugin from a link (an MCP server URL) or a folder on this computer; it starts switched off',
    params: NOTHING,
    query: NOTHING,
    body: PLUGIN_INSTALL,
    response: PLUGIN_ROW,
  }),
  updatePlugin: endpoint({
    method: 'PATCH',
    path: '/api/plugins/:pluginId',
    access: 'owner',
    summary:
      'Switch a plugin on or off, trust it, switch single tools, or change its settings; switching on a plugin that can post into chats or join calls needs confirm',
    params: PLUGIN_PARAMS,
    query: NOTHING,
    body: PLUGIN_CHANGE,
    response: PLUGIN_SAVED,
  }),
  restartPlugin: endpoint({
    method: 'POST',
    path: '/api/plugins/:pluginId/restart',
    access: 'owner',
    summary: 'Restart a plugin that is switched on',
    params: PLUGIN_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: PLUGIN_ROW,
  }),
  removePlugin: endpoint({
    method: 'DELETE',
    path: '/api/plugins/:pluginId',
    access: 'owner',
    summary: 'Remove a plugin, its tools, data and stored secrets',
    params: PLUGIN_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  readPluginTools: endpoint({
    method: 'GET',
    path: '/api/plugins/:pluginId/tools',
    access: 'owner',
    summary: 'The tools a running plugin offers, with what each can do and whether it is on',
    params: PLUGIN_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PLUGIN_TOOL_ROW),
  }),
  readPluginLog: endpoint({
    method: 'GET',
    path: '/api/plugins/:pluginId/log',
    access: 'owner',
    summary: 'The latest lines a plugin wrote to its log, oldest first',
    params: PLUGIN_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PLUGIN_LOG_LINE),
  }),
  callPluginTool: endpoint({
    method: 'POST',
    path: '/api/plugins/:pluginId/tools/:tool',
    access: 'member',
    summary:
      'Run one tool of a switched-on plugin, as a person; tools that remove things need confirm, setup tools need an owner',
    params: TOOL_PARAMS,
    query: NOTHING,
    body: PLUGIN_TOOL_CALL,
    response: PLUGIN_TOOL_OUTCOME,
  }),
  readPluginData: endpoint({
    method: 'GET',
    path: '/api/plugins/:pluginId/data',
    access: 'member',
    summary:
      'The latest value of each data stream a plugin publishes, or the recent values of one stream, newest first',
    params: PLUGIN_PARAMS,
    query: DATA_QUERY,
    body: NO_BODY,
    response: z.array(PLUGIN_DATA_POINT),
  }),
  listPluginSearch: endpoint({
    method: 'GET',
    path: '/api/plugins/search',
    access: 'member',
    summary: 'Search entries that switched-on plugins add to the app’s global search',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PLUGIN_SEARCH_HIT),
  }),
  postPluginMessage: endpoint({
    method: 'POST',
    path: '/api/ai/inbox',
    access: 'owner',
    summary:
      'A plugin hands over a message from one of its conversations; the AI answers it in that conversation’s chat and the answer goes back through the plugin. Plugin keys only',
    params: NOTHING,
    query: NOTHING,
    body: INBOUND_MESSAGE,
    response: DONE,
  }),
} as const;
