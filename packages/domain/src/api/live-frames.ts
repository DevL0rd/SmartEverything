import { z } from 'zod';
import { JSON_VALUE } from '../values';
import { TABLE_ROWS, type LiveTable, type TableRow } from './live-rows';

type KeyColumns = { readonly [T in LiveTable]: readonly (keyof TableRow<T> & string)[] };

export const LIVE_ROW_KEYS = {
  settings: [],
  clients: ['id'],
  provider_links: ['provider'],
  rooms: ['id'],
  device_groups: ['id'],
  device_effect_targets: ['device_id', 'capability'],
  devices: ['id'],
  television_settings: ['device_id'],
  device_state: ['device_id', 'capability'],
  state_history: ['id'],
  commands: ['id'],
  events: ['id'],
  cameras: ['device_id'],
  recordings: ['id'],
  ir_remotes: ['id'],
  ir_codes: ['id'],
  automations: ['id'],
  automation_values: ['id'],
  automation_runs: ['id'],
  layouts: ['client_id', 'profile_id', 'page'],
  push_targets: ['token'],
  health_sources: ['client_id'],
  health_daily: ['profile_id', 'day', 'metric'],
  mcp_tokens: ['id'],
  oauth_clients: ['id'],
  profiles: ['id'],
  body_readings: ['id'],
  health_entries: ['id'],
  foods: ['id'],
  watch_days: ['profile_id', 'device_id', 'day', 'kind'],
  weather: ['id'],
  exchange_rates: ['id'],
  talk_channels: ['id'],
  talk_members: ['channel_id', 'member_kind', 'member_id'],
  talk_messages: ['id'],
  assistant_messages: ['id'],
  ai_chats: ['id'],
  scheduled_actions: ['id'],
  ai_usage: ['id'],
  plugins: ['id'],
  plugin_streams: ['plugin_id', 'stream'],
  plugin_ui: ['id'],
  ai_outreach: ['id'],
  home_maps: ['id'],
  model_assets: ['sha256'],
  model_catalog: ['id', 'owner'],
  model_overrides: ['scope', 'target'],
  automation_plugin_kinds: ['kind_id'],
  drive_roots: ['id'],
  drive_albums: ['id'],
  drive_grants: ['id'],
  drive_placements: ['id'],
  drive_notifications: ['id'],
  drive_access_requests: ['id'],
  drive_file_requests: ['id'],
  drive_transfers: ['id'],
  drive_offline_items: ['clientId', 'itemId'],
  planner_collections: ['id'],
  planner_items: ['id'],
  planner_occurrences: ['item_id', 'occurrence_key'],
  planner_alarms: ['id'],
  planner_timers: ['id'],
  planner_stopwatches: ['id'],
  planner_collection_shares: ['collection_id', 'profile_id'],
  planner_guests: ['id'],
  planner_booking_pages: ['id'],
  google_accounts: ['profile_id'],
} as const satisfies KeyColumns;

class UnreadableRowSchemaError extends Error {
  override readonly name = 'UnreadableRowSchemaError';

  constructor(readonly table: string) {
    super(`The live row schema of ${table} names no columns.`);
  }
}

function columnsOf(table: string, schema: z.core.$ZodType): readonly string[] {
  if (schema instanceof z.ZodObject) return Object.keys(schema.shape);
  if (schema instanceof z.ZodReadonly) return columnsOf(table, schema.unwrap());
  if (schema instanceof z.ZodPipe) return columnsOf(table, schema.in);
  if (schema instanceof z.ZodUnion) {
    return [...new Set(schema.options.flatMap((option) => columnsOf(table, option)))];
  }
  throw new UnreadableRowSchemaError(table);
}

export function liveColumnsOf(table: LiveTable): readonly string[] {
  return columnsOf(table, TABLE_ROWS[table]);
}

const COLUMNS = z.record(z.string(), JSON_VALUE);

function columnsIn(table: LiveTable): typeof COLUMNS {
  const columns = new Set(liveColumnsOf(table));
  return COLUMNS.refine((values) => Object.keys(values).every((column) => columns.has(column)), {
    message: `names a column that ${table} does not have`,
  });
}

function keyIn(table: LiveTable): typeof COLUMNS {
  const keys: readonly string[] = LIVE_ROW_KEYS[table];
  return COLUMNS.refine(
    (values) =>
      Object.keys(values).length === keys.length &&
      keys.every((column) => Object.hasOwn(values, column)),
    { message: `must name exactly the key of ${table}: ${keys.join(', ')}` },
  );
}

const CLEARED = z.array(z.string().min(1)).min(1).optional();

type FrameSchema<T extends LiveTable, S extends z.ZodType> = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{
      type: z.ZodLiteral<'change'>;
      table: z.ZodLiteral<T>;
      operation: z.ZodLiteral<'INSERT'>;
      record: S;
    }>,
    z.ZodObject<{
      type: z.ZodLiteral<'change'>;
      table: z.ZodLiteral<T>;
      operation: z.ZodLiteral<'UPDATE'>;
      key: typeof COLUMNS;
      set: typeof COLUMNS;
      previous: typeof COLUMNS;
      cleared: typeof CLEARED;
    }>,
    z.ZodObject<{
      type: z.ZodLiteral<'change'>;
      table: z.ZodLiteral<T>;
      operation: z.ZodLiteral<'DELETE'>;
      key: typeof COLUMNS;
      oldRecord: S;
    }>,
  ],
  'operation'
>;

export function liveFrameSchemaOf<T extends LiveTable, S extends z.ZodType>(
  table: T,
  row: S,
): FrameSchema<T, S> {
  const base = { type: z.literal('change'), table: z.literal(table) };
  const columns = columnsIn(table);
  const key = keyIn(table);
  return z.discriminatedUnion('operation', [
    z.object({ ...base, operation: z.literal('INSERT'), record: row }),
    z.object({
      ...base,
      operation: z.literal('UPDATE'),
      key,
      set: columns,
      previous: columns,
      cleared: CLEARED,
    }),
    z.object({ ...base, operation: z.literal('DELETE'), key, oldRecord: row }),
  ]);
}
