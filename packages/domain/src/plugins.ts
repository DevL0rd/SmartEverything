import { z } from 'zod';
import { WIDGET_SIZE } from './board-layout';
import { MCP_TOOL_AREAS } from './mcp/areas';
import { PLUGIN_SOURCE_PREFIX } from './signal-sources/rates';
import type { SignalSourceSpec } from './signal-sources/spec';
import {
  PLUGIN_ID,
  PLUGIN_JSON_OBJECT as JSON_OBJECT,
  PLUGIN_KEY as KEY,
  PLUGIN_TITLE as TITLE,
  PLUGIN_TOOL as TOOL,
  type PluginId,
} from './plugin-parts';
import { PLUGIN_SETTING } from './plugin-settings';
import { JSON_VALUE } from './values';

const MOMENT = z.iso.datetime({ offset: true });

export * from './plugin-options';
export * from './plugin-people';
export * from './plugin-settings';
export { PLUGIN_ID, type PluginId };

export const PLUGIN_TOOL_SEPARATOR = '__';

export function pluginToolName(pluginId: PluginId, tool: string): string {
  return `${pluginId}${PLUGIN_TOOL_SEPARATOR}${tool}`;
}

export const PLUGIN_MCP = z.discriminatedUnion('transport', [
  z.strictObject({
    transport: z.literal('stdio'),
    command: z.string().min(1).max(500),
    args: z.array(z.string().max(2000)).max(50).default([]),
    env: z.record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), z.string().max(2000)).default({}),
    cwd: z.string().min(1).max(500).nullable().default(null),
  }),
  z.strictObject({
    transport: z.literal('http'),
    url: z.url({ protocol: /^https?$/ }),
    bearer: z.string().min(1).max(500).nullable().default(null),
  }),
]);

export type PluginMcp = z.output<typeof PLUGIN_MCP>;

export const PLUGIN_FILE_ACCESS = ['own', 'none'] as const;

export const PLUGIN_LISTEN_PROTOCOLS = ['tcp', 'udp'] as const;

export const PLUGIN_LISTEN = z.strictObject({
  protocol: z.enum(PLUGIN_LISTEN_PROTOCOLS),
  port: z.int().min(1).max(65_535),
  purpose: TITLE,
});

export type PluginListen = z.output<typeof PLUGIN_LISTEN>;

export const PLUGIN_PERMISSIONS = z.strictObject({
  seAreas: z.array(z.enum(MCP_TOOL_AREAS)).max(MCP_TOOL_AREAS.length).default([]),
  inbound: z.boolean().default(false),
  voice: z.boolean().default(false),
  network: z.boolean().default(true),
  files: z.enum(PLUGIN_FILE_ACCESS).default('own'),
  listen: z.array(PLUGIN_LISTEN).max(8).default([]),
});

export type PluginPermissions = z.output<typeof PLUGIN_PERMISSIONS>;

export const PLUGIN_DATA_STREAM = z.strictObject({
  stream: KEY,
  title: TITLE,
  schema: JSON_OBJECT,
  unit: z.string().min(1).max(20).nullable().default(null),
  history: z.int().min(0).max(200).default(200),
  live: z.boolean().default(false),
});

export type PluginDataStream = z.output<typeof PLUGIN_DATA_STREAM>;

export const PLUGIN_EVENT_FIELD_TYPES = ['string', 'number', 'boolean'] as const;

export const PLUGIN_EVENT_KIND = z.strictObject({
  kind: KEY,
  title: TITLE,
  fields: z.record(KEY, z.enum(PLUGIN_EVENT_FIELD_TYPES)).default({}),
  feed: z.boolean().default(true),
});

export type PluginEventKind = z.output<typeof PLUGIN_EVENT_KIND>;

const STREAM_FIELD_PATH = z
  .string()
  .max(80)
  .regex(
    /^[A-Za-z_][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*$/,
    'a field of the reading, or a dotted path such as summary.peersOnline',
  );

const STREAM_REF = z.strictObject({
  stream: KEY,
  field: STREAM_FIELD_PATH.nullable().default(null),
});

const CONTROL_BASE = { label: TITLE, tool: TOOL, args: JSON_OBJECT.default({}) };

export const WIDGET_CONTROL = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('button'), ...CONTROL_BASE }),
  z.strictObject({ kind: z.literal('toggle'), ...CONTROL_BASE, value: STREAM_REF, arg: KEY }),
  z.strictObject({
    kind: z.literal('slider'),
    ...CONTROL_BASE,
    value: STREAM_REF,
    arg: KEY,
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
  }),
]);

export const WIDGET_BODY = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('figure'), value: STREAM_REF, caption: TITLE.nullable() }),
  z.strictObject({
    type: z.literal('gauge'),
    value: STREAM_REF,
    min: z.number(),
    max: z.number(),
  }),
  z.strictObject({
    type: z.literal('sparkline'),
    value: STREAM_REF,
    minutes: z.int().min(1).max(1440),
  }),
  z.strictObject({ type: z.literal('list'), value: STREAM_REF, limit: z.int().min(1).max(20) }),
  z.strictObject({ type: z.literal('controls'), items: z.array(WIDGET_CONTROL).min(1).max(6) }),
]);

export type WidgetBody = z.output<typeof WIDGET_BODY>;

export type WidgetControl = z.output<typeof WIDGET_CONTROL>;

export type WidgetStreamRef = z.output<typeof STREAM_REF>;

export const WIDGET_SPEC = z.strictObject({
  id: KEY,
  title: TITLE,
  icon: z.string().min(1).max(40),
  sizes: z
    .array(WIDGET_SIZE)
    .min(1)
    .transform((sizes) => [...new Set(sizes)]),
  body: WIDGET_BODY,
});

export type WidgetSpec = z.output<typeof WIDGET_SPEC>;

export const PLUGIN_PAGE_SECTION = z.strictObject({ title: TITLE, body: WIDGET_BODY });

export const PLUGIN_PAGE_SECTIONS_MAX = 12;

export const PLUGIN_PAGE = z.strictObject({
  id: KEY,
  title: TITLE,
  icon: z.string().min(1).max(40),
  sections: z.array(PLUGIN_PAGE_SECTION).min(1).max(PLUGIN_PAGE_SECTIONS_MAX),
});

export type PluginPage = z.output<typeof PLUGIN_PAGE>;

export function pluginWidgetType(pluginId: PluginId, widgetId: string): string {
  const own = widgetId.startsWith(`${pluginId}-`) || widgetId.startsWith(`${pluginId}.`);
  return own ? widgetId : `${pluginId}.${widgetId}`;
}

const PLUGIN_PAGE_ROUTE_PREFIX = 'plugin.';

export function pluginPageRoute(pluginId: PluginId, pageId: string): string {
  return `${PLUGIN_PAGE_ROUTE_PREFIX}${pluginId}.${pageId}`;
}

export function parsePluginPageRoute(
  route: string,
): { readonly pluginId: PluginId; readonly pageId: string } | null {
  if (!route.startsWith(PLUGIN_PAGE_ROUTE_PREFIX)) return null;
  const rest = route.slice(PLUGIN_PAGE_ROUTE_PREFIX.length);
  const split = rest.indexOf('.');
  if (split < 0) return null;
  const pluginId = PLUGIN_ID.safeParse(rest.slice(0, split));
  const pageId = KEY.safeParse(rest.slice(split + 1));
  return pluginId.success && pageId.success
    ? { pluginId: pluginId.data, pageId: pageId.data }
    : null;
}

export const PLUGIN_COMMAND = z.strictObject({ name: KEY, title: TITLE, tool: TOOL });

export const PLUGIN_SEARCH_MODES = ['push', 'query'] as const;

export const PLUGIN_CONTRIBUTIONS = z.strictObject({
  directTools: z.array(TOOL).max(40).default([]),
  widgets: z.array(WIDGET_SPEC).max(30).default([]),
  pages: z.array(PLUGIN_PAGE).max(10).default([]),
  data: z.array(PLUGIN_DATA_STREAM).max(50).default([]),
  events: z.array(PLUGIN_EVENT_KIND).max(50).default([]),
  search: z.enum(PLUGIN_SEARCH_MODES).nullable().default(null),
  settings: z.record(KEY, PLUGIN_SETTING).default({}),
  peoplePicker: KEY.nullable().default(null),
  commands: z.array(PLUGIN_COMMAND).max(20).default([]),
  deviceFamilies: z.array(KEY).max(20).default([]),
});

export type PluginContributions = z.output<typeof PLUGIN_CONTRIBUTIONS>;

export const PLUGIN_MANIFEST = z.strictObject({
  id: PLUGIN_ID,
  name: z.string().trim().min(1).max(60),
  version: z.string().regex(/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/, 'a version like 1.2.0'),
  description: z.string().trim().min(1).max(300),
  publisher: z.string().trim().min(1).max(60),
  icon: z.string().min(1).max(500).nullable().default(null),
  homepage: z
    .url({ protocol: /^https?$/ })
    .nullable()
    .default(null),
  mcp: PLUGIN_MCP.nullable().default(null),
  permissions: PLUGIN_PERMISSIONS.prefault({}),
  contributes: PLUGIN_CONTRIBUTIONS.prefault({}),
  requires: z.string().max(40).nullable().default(null),
});

export type PluginManifest = z.output<typeof PLUGIN_MANIFEST>;

export type PluginManifestInput = z.input<typeof PLUGIN_MANIFEST>;

export const PLUGIN_SOURCES = ['builtin', 'local', 'url'] as const;

export type PluginSource = (typeof PLUGIN_SOURCES)[number];

export const PLUGIN_STATUSES = [
  'disabled',
  'starting',
  'running',
  'crashed',
  'needs_auth',
] as const;

export type PluginStatus = (typeof PLUGIN_STATUSES)[number];

export const PLUGIN_ROW = z.object({
  id: PLUGIN_ID,
  manifest: PLUGIN_MANIFEST,
  source: z.enum(PLUGIN_SOURCES),
  location: z.string().min(1).nullable(),
  enabled: z.boolean(),
  trusted: z.boolean(),
  status: z.enum(PLUGIN_STATUSES),
  status_detail: z.string().nullable(),
  tool_switches: z.record(TOOL, z.boolean()),
  settings: JSON_OBJECT,
  secret_names: z.array(KEY),
  icon_url: z.string().min(1).nullable(),
  installed_at: MOMENT,
  updated_at: MOMENT,
});

export type PluginRow = z.infer<typeof PLUGIN_ROW>;

export const PLUGIN_UI_ROW = z.object({
  id: PLUGIN_ID,
  name: PLUGIN_MANIFEST.shape.name,
  icon_url: z.string().min(1).nullable(),
  widgets: z.array(WIDGET_SPEC),
  pages: z.array(PLUGIN_PAGE),
  tools_off: z.array(TOOL),
});

export type PluginUiRow = z.infer<typeof PLUGIN_UI_ROW>;

export const INBOUND_PRIORITIES = ['normal', 'urgent'] as const;

export const INBOUND_ATTACHMENT = z.object({
  name: z.string().min(1),
  mime: z.string().min(1),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('url'), url: z.url({ protocol: /^https?$/ }) }),
    z.object({ kind: z.literal('path'), path: z.string().min(1) }),
    z.object({ kind: z.literal('base64'), data: z.base64() }),
  ]),
});

export const PLUGIN_REPLY_FILE = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  mime: z.string().min(1),
});

export type PluginReplyFile = z.output<typeof PLUGIN_REPLY_FILE>;

export const INBOUND_MESSAGE = z.object({
  eventId: z.string().min(1),
  conversation: z.object({ key: z.string().min(1), title: TITLE }),
  text: z.string(),
  from: z
    .object({
      id: z.string().min(1),
      name: z.string().trim().min(1),
      trusted: z.boolean().default(false),
    })
    .describe('The sender: the plugin’s id for them and their name'),
  attachments: z.array(INBOUND_ATTACHMENT).default([]),
  reply: z.object({
    tool: TOOL,
    eventIdArg: KEY.default('eventId'),
    textArg: KEY.default('text'),
    progressArg: KEY.nullable().default(null),
    filesArg: KEY.nullable().default(null),
  }),
  rule: z.string().nullable().default(null),
  voice: z.boolean().default(false),
  priority: z.enum(INBOUND_PRIORITIES).default('normal'),
});

export type InboundMessage = z.output<typeof INBOUND_MESSAGE>;

export const PLUGIN_DATA_POINT = z.object({
  stream: KEY,
  value: JSON_VALUE,
  at: MOMENT,
});

export type PluginDataPoint = z.infer<typeof PLUGIN_DATA_POINT>;

export const PLUGIN_STREAM_ROW = z.object({
  plugin_id: PLUGIN_ID,
  stream: KEY,
  value: JSON_VALUE,
  at: MOMENT,
});

export type PluginStreamRow = z.infer<typeof PLUGIN_STREAM_ROW>;

export function pluginStreamKey(pluginId: string, stream: string): string {
  return `${pluginId}/${stream}`;
}

export const PLUGIN_EVENT = z.object({
  kind: KEY,
  subject: z.string().min(1).nullable().default(null),
  data: JSON_OBJECT.default({}),
});

export type PluginEvent = z.output<typeof PLUGIN_EVENT>;

export const PLUGIN_SEARCH_ENTRY = z.object({
  id: z.string().min(1),
  title: TITLE,
  subtitle: z.string().nullable().default(null),
  keywords: z.array(z.string().min(1)).default([]),
  target: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('device'),
      externalId: z.string().min(1),
      section: KEY.nullable().default(null),
      query: z.record(KEY, z.string()).default({}),
    }),
    z.object({
      kind: z.literal('path'),
      path: z.string().regex(/^\/[^\s?#]*$/, 'an app path starting with /'),
    }),
  ]),
});

export type PluginSearchEntry = z.output<typeof PLUGIN_SEARCH_ENTRY>;

export const PLUGIN_NOTIFICATIONS = {
  message: 'notifications/smarteverything/message',
  data: 'notifications/smarteverything/data',
  event: 'notifications/smarteverything/event',
  search: 'notifications/smarteverything/search',
} as const;

export const PLUGIN_MANIFEST_RESOURCE = 'se://manifest';

export const PLUGIN_MANIFEST_FILE = 'smarteverything-plugin.json';

export function pluginSignalSource(pluginId: PluginId): string {
  return `${PLUGIN_SOURCE_PREFIX}${pluginId.replaceAll('-', '_')}`;
}

export function pluginSignalSpec(manifest: PluginManifest): SignalSourceSpec {
  return {
    source: pluginSignalSource(manifest.id),
    label: manifest.name,
    kinds: manifest.contributes.events.map((event) => ({
      kind: event.kind,
      label: event.title,
      subject: 'none',
      fields: [],
      match: Object.keys(event.fields).map((key) => ({ key, label: key, values: null })),
      pulse: true,
      feed: event.feed,
    })),
  };
}

const PLUGIN_CHAT_PREFIX = 'plugin:';

export function pluginChatKey(pluginId: PluginId, conversationKey: string): string {
  return `${PLUGIN_CHAT_PREFIX}${pluginId}:${conversationKey}`;
}

export function pluginIdOfChat(chat: {
  readonly kind: string;
  readonly source_key: string | null;
}): PluginId | null {
  if (chat.kind !== 'plugin' || chat.source_key?.startsWith(PLUGIN_CHAT_PREFIX) !== true) {
    return null;
  }
  const rest = chat.source_key.slice(PLUGIN_CHAT_PREFIX.length);
  const end = rest.indexOf(':');
  const parsed = PLUGIN_ID.safeParse(end > 0 ? rest.slice(0, end) : '');
  return parsed.success ? parsed.data : null;
}
