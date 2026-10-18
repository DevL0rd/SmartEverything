import { z } from 'zod';
import { AI_EFFORT, OPENROUTER_DEFAULTS, OPENROUTER_SETTINGS } from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import type { Sql } from '../sql';
import { meteredEngine, type MeteredCatalogue } from '../../openrouter/metered-engine';

const OFFERED =
  "('danger-full-access/never', 'workspace-write/on-request', 'read-only/on-request')";

function normalized(column: string, path: string): string {
  const policy = `case json_extract(${column}, '${path}.sandbox')
    when 'read-only' then '{"sandbox":"read-only","approval":"on-request"}'
    else '{"sandbox":"workspace-write","approval":"on-request"}' end`;
  return `json_set(${column}, '${path}', json(${policy}))`;
}

function offMenu(column: string, path: string): string {
  return `json_extract(${column}, '${path}') is not null and
    json_extract(${column}, '${path}.sandbox') || '/' || json_extract(${column}, '${path}.approval') not in ${OFFERED}`;
}

function retarget(table: string, column: string, path: string, where: string): string {
  return `update ${table} set ${column} = ${normalized(column, path)}
    where ${where} and ${offMenu(column, path)}`;
}

export const DSH_ENGINE_STATEMENTS: readonly string[] = [
  retarget('ai_chats', 'engine', '$.permission', "json_extract(engine, '$.kind') = 'dsh'"),
  retarget(
    'ai_engine_defaults',
    'engine',
    '$.permission',
    "engine is not null and json_extract(engine, '$.kind') = 'dsh'",
  ),
  retarget('harness_grants', 'permission', '$', '1 = 1'),
  retarget('harness_projections', 'projection', '$.permission', '1 = 1'),
  retarget('harness_projections', 'projection', '$.permission_change.permission', '1 = 1'),
  retarget(
    'harness_operations',
    'request',
    '$.permission',
    "json_extract(request, '$.kind') = 'permission'",
  ),
  retarget('ai_agent_runs', 'projection', '$.harness.permission', '1 = 1'),
];

const OPENROUTER_ENGINE = z.object({
  model: z.string().nullable().default(null),
  effort: z.string().nullable().default(null),
});
const CHAT = z.strictObject({ id: z.string(), profile_id: z.string(), engine: z.string() });
const DEFAULT = z.strictObject({ engine: z.string() });
const PROFILE = z.strictObject({ id: z.string() });
const SETTINGS = z.strictObject({ settings: z.string() });
const MODEL = z.strictObject({
  reasoning: z.enum(['none', 'optional', 'mandatory']),
  efforts: z.string(),
});

function catalogueOf(sql: Sql): MeteredCatalogue {
  const stored = sql.get(SETTINGS, "select settings from ai_settings where key = 'openrouter'");
  const settings =
    stored === undefined
      ? OPENROUTER_DEFAULTS
      : OPENROUTER_SETTINGS.parse(JSON.parse(stored.settings));
  return {
    defaults: settings,
    row: (id): ReturnType<MeteredCatalogue['row']> => {
      const row = sql.get(MODEL, 'select reasoning, efforts from ai_models where id = $id', { id });
      return row === undefined
        ? undefined
        : { reasoning: row.reasoning, efforts: z.array(AI_EFFORT).parse(JSON.parse(row.efforts)) };
    },
  };
}

export function moveOpenrouterEngines(sql: Sql): LogPayload {
  const catalogue = catalogueOf(sql);
  const chats = sql.all(
    CHAT,
    "select id, profile_id, engine from ai_chats where json_extract(engine, '$.kind') = 'openrouter'",
  );
  for (const chat of chats) {
    const engine = meteredEngine(
      chat.profile_id,
      OPENROUTER_ENGINE.parse(JSON.parse(chat.engine)),
      catalogue,
    );
    sql.run('convert a stored chat engine', 'update ai_chats set engine = $engine where id = $id', {
      id: chat.id,
      engine: JSON.stringify(engine),
    });
  }
  return { chats: chats.length, defaults: moveDefault(sql, catalogue) };
}

function moveDefault(sql: Sql, catalogue: MeteredCatalogue): number {
  const stored = sql.get(
    DEFAULT,
    "select engine from ai_engine_defaults where singleton = 1 and json_extract(engine, '$.kind') = 'openrouter'",
  );
  if (stored === undefined) return 0;
  const owner = sql.get(PROFILE, 'select id from profiles order by position, created_at limit 1');
  const engine =
    owner === undefined
      ? null
      : JSON.stringify(
          meteredEngine(owner.id, OPENROUTER_ENGINE.parse(JSON.parse(stored.engine)), catalogue),
        );
  return sql.run(
    'convert the stored default chat engine',
    'update ai_engine_defaults set engine = $engine where singleton = 1',
    { engine },
  );
}
