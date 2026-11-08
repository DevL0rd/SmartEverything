import { randomUUID } from 'node:crypto';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import type { Sql } from '../sql';
import type { Migration } from './migration';

const HUB_MODEL = 'smarteverything.computer.hub';
const PC_MODEL = 'smarteverything.computer';
const HUB_EXTERNAL_ID = 'computer:hub';

const RUNTIME_BINDING_TABLES = [
  'computer_ai',
  'computer_native_mcp_policy',
  'computer_local_mcp_grants',
  'ai_engine_preferences',
  'ai_provider_sessions',
] as const;

const OLD_ROWS = z.object({ id: z.string() });
const EXISTING = z.object({ id: z.string() });

function historyPath(deviceId: string): string {
  return `$.devices."${deviceId}"`;
}

function createHubDevice(sql: Sql, ownerId: string, now: string): string {
  const existing = sql.get(
    EXISTING,
    "select id from devices where provider = 'local' and external_id = $externalId",
    { externalId: HUB_EXTERNAL_ID },
  );
  if (existing !== undefined) return existing.id;
  const id = randomUUID();
  sql.run(
    "create the hub's own device",
    `insert into devices (id, provider, external_id, kind, name, display_name, model, manufacturer, online, capabilities, details, created_at, updated_at)
     select $id, provider, $externalId, kind, name, display_name, $model, manufacturer, 1, '[]', details, $now, $now
     from devices where id = $ownerId`,
    { id, externalId: HUB_EXTERNAL_ID, model: HUB_MODEL, now, ownerId },
  );
  return id;
}

function moveBindings(sql: Sql, from: string, to: string): Record<string, number> {
  const moved: Record<string, number> = {};
  for (const table of RUNTIME_BINDING_TABLES) {
    moved[table] = sql.run(
      `move the ${table} rows to the hub's own device`,
      `update ${table} set device_id = $to where device_id = $from`,
      { from, to },
    );
  }
  return moved;
}

function rebindCachedModels(sql: Sql, to: string): number {
  return sql.run(
    "point the cached runtime models at the hub's own device",
    `update computer_ai set models = (
       select json_group_array(json_set(value, '$.device_id', $to) order by key)
       from json_each(computer_ai.models))
     where device_id = $to and json_type(models) = 'array'`,
    { to },
  );
}

function moveHistoryOverride(sql: Sql, from: string, to: string): number {
  return sql.run(
    "move the history override to the hub's own device",
    `update settings set history_settings = json_remove(
       json_set(history_settings, $target, json(json_extract(history_settings, $source))), $source)
     where json_type(history_settings, $source) is not null`,
    { source: historyPath(from), target: historyPath(to) },
  );
}

export function giveHubItsOwnDevice(sql: Sql, now: string): LogPayload {
  const rows = sql.all(
    OLD_ROWS,
    `select id from devices
     where provider = 'local' and kind = 'computer' and model = $model and external_id <> $externalId
     order by created_at, id`,
    { model: HUB_MODEL, externalId: HUB_EXTERNAL_ID },
  );
  const [owner] = rows;
  if (owner === undefined) return { converted: 0 };
  const hubId = createHubDevice(sql, owner.id, now);
  const moved = moveBindings(sql, owner.id, hubId);
  const models = rebindCachedModels(sql, hubId);
  const history = moveHistoryOverride(sql, owner.id, hubId);
  sql.run(
    'turn the former hub-role computer rows into ordinary computers',
    `update devices set model = $pc
     where provider = 'local' and kind = 'computer' and model = $hub and external_id <> $externalId`,
    { pc: PC_MODEL, hub: HUB_MODEL, externalId: HUB_EXTERNAL_ID },
  );
  return { converted: rows.length, hubId, moved, models, historyOverrides: history };
}

export const HUB_OWN_DEVICE_MIGRATION: Migration = {
  version: 191,
  name: 'hub-own-device',
  statements: [],
  backfill: giveHubItsOwnDevice,
};
