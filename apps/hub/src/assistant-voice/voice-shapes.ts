import { pluginToolName } from '@smarteverything/domain';
import type { JsonSchema, ToolSpec } from '../ai-tools/hub-tool';
import { META_TOOL_NAMES } from '../ai-tools/tool-sets';

type Json = Readonly<Record<string, unknown>>;

type Row = (row: Json) => Json;

interface VoiceList {
  readonly key: string;
  readonly row: (row: Json, rows: readonly Json[], args: Json) => Json;
}

export const VOICE_PAGE = 25;

const CAPABILITY_KEYS_UP_TO = 5;

const MORE =
  'Only part of the list was sent. Ask for what they need with a filter (a room, a family or words in the name), or call again with offset set to next_offset.';

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function present(entries: Json): Json {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== null && value !== undefined),
  );
}

function unique(values: readonly unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string'))];
}

const deviceRow = (row: Json, rows: readonly Json[]): Json => {
  if (isRecord(row['device'])) {
    return row;
  }
  return present({
    id: row['id'],
    name: row['name'],
    room: row['room'],
    family: row['family'],
    online: row['online'],
    capabilities: rows.length <= CAPABILITY_KEYS_UP_TO ? row['capabilities'] : undefined,
  });
};

const automationRow = (row: Json, _rows: readonly Json[], args: Json): Json => {
  if (typeof args['automationId'] === 'string') {
    return row;
  }
  return present({
    id: row['id'],
    name: row['name'],
    on: row['enabled'],
    rooms: row['rooms'],
    last_run: row['last_run_at'],
    last_error: row['last_error'],
  });
};

const sceneRow: Row = (row) =>
  present({
    id: row['id'],
    name: row['name'],
    devices: Array.isArray(row['actions'])
      ? unique(
          row['actions'].map((action: unknown) => (isRecord(action) ? action['device'] : null)),
        )
      : undefined,
    problem: row['problem'],
  });

const clientRow: Row = (row) =>
  present({
    name: row['name'],
    ip: row['ip'],
    mac: row['mac'],
    connected: row['connected'],
    blocked: row['blocked'] === true ? true : undefined,
  });

const VOICE_LISTS: ReadonlyMap<string, VoiceList> = new Map([
  ['find_devices', { key: 'devices', row: deviceRow }],
  ['list_automations', { key: 'automations', row: automationRow }],
  ['list_scenes', { key: 'scenes', row: sceneRow }],
  [pluginToolName('router', 'list_clients'), { key: 'clients', row: clientRow }],
]);

interface Reached {
  readonly name: string;
  readonly args: Json;
}

export function reachedCall(name: string, args: Json): Reached {
  const forwarded = args['name'];
  const inner = args['arguments'];
  if (name === META_TOOL_NAMES.call && typeof forwarded === 'string') {
    return { name: forwarded, args: isRecord(inner) ? inner : {} };
  }
  return { name, args };
}

function pagedArgs(args: Json): Json {
  const asked = args['limit'];
  const limit = typeof asked === 'number' && asked > 0 ? Math.min(asked, VOICE_PAGE) : VOICE_PAGE;
  return { ...args, limit };
}

export function voiceArgumentsOf(name: string, args: Json): Json {
  const reached = reachedCall(name, args);
  if (!VOICE_LISTS.has(reached.name)) {
    return args;
  }
  const paged = pagedArgs(reached.args);
  return name === META_TOOL_NAMES.call ? { ...args, arguments: paged } : paged;
}

export function voiceListOf(name: string, args: Json, response: Json): Json | null {
  const reached = reachedCall(name, args);
  const list = VOICE_LISTS.get(reached.name);
  const rows = response[list?.key ?? ''];
  if (list === undefined || !Array.isArray(rows) || 'error' in response) {
    return null;
  }
  const records = rows.filter(isRecord);
  const more = response['more'];
  return {
    ...response,
    [list.key]: records.map((row) => list.row(row, records, reached.args)),
    ...(isRecord(more) ? { more: { ...more, ask: MORE } } : {}),
  };
}

function pagedSchema(schema: JsonSchema): JsonSchema {
  const properties = schema['properties'];
  if (!isRecord(properties) || !isRecord(properties['limit'])) {
    return schema;
  }
  return {
    ...schema,
    properties: {
      ...properties,
      limit: { ...properties['limit'], maximum: VOICE_PAGE, default: VOICE_PAGE },
    },
  };
}

export function voiceSpecOf<T extends ToolSpec>(spec: T): T {
  if (!VOICE_LISTS.has(spec.name)) {
    return spec;
  }
  return { ...spec, inputSchema: pagedSchema(spec.inputSchema) };
}
