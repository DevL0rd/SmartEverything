import { randomUUID } from 'node:crypto';
import { AUTOMATION_RUNS_KEPT, type PluginOrigin } from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { SQL_JSON, flag, jsonText, type Sql } from '../sql';
import { AUTOMATION_DEFINITION } from './legacy/v1-definition';
import { AUTOMATION_SEQUENCE_DEFINITION } from './legacy/v1-sequences';
import { automationV2Of, sequenceV2Of, type AutomationConversion } from './legacy/v2-convert';
import { identifiedAutomationV2 } from './legacy/v2-identify';

export const AUTOMATION_V2_STATEMENTS: readonly string[] = [
  'alter table automations add column revision integer not null default 1 check (revision >= 1)',
  "alter table automations add column origin text check (origin is null or (json_valid(origin) and json_type(origin) = 'object'))",
  'alter table automations add column definition_v1 text check (definition_v1 is null or json_valid(definition_v1))',
  `create table automation_runs_next (
    id text primary key, automation_id text not null, revision integer not null,
    owner_profile_id text, control_key text, parent_run_id text, status text not null,
    current_node text, trace text not null, error text, created_at text not null,
    started_at text, finished_at text
  ) strict`,
  `insert into automation_runs_next
    select id, automation_id, 1, owner_profile_id, control_key, parent_run_id, status,
      current_node, trace, error, created_at, started_at, finished_at
    from (
      select *, row_number() over (partition by automation_id order by created_at desc, rowid desc) as position
      from automation_runs
    ) where position <= ${String(AUTOMATION_RUNS_KEPT)}`,
  'delete from automation_run_commands where run_id not in (select id from automation_runs_next)',
  'drop table automation_runs',
  'alter table automation_runs_next rename to automation_runs',
  'create index automation_runs_target on automation_runs(automation_id, created_at)',
  'create index automation_runs_status on automation_runs(status, created_at)',
];

const AUTOMATION = z.strictObject({
  id: z.string(),
  name: z.string(),
  definition: SQL_JSON,
});
const SEQUENCE = z.strictObject({
  id: z.string(),
  name: z.string(),
  definition: SQL_JSON,
  created_at: z.string(),
  updated_at: z.string(),
});
const NAME = z.strictObject({ name: z.string() });
const NAME_LENGTH = 80;

interface Migrated {
  readonly definition: string;
  readonly origin: PluginOrigin | null;
  readonly disabled: boolean;
  readonly lastError: string | null;
}

function issuesOf(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

function migrated(conversion: AutomationConversion, original: string): Migrated {
  if ('unmigrated' in conversion)
    return {
      definition: original,
      origin: null,
      disabled: true,
      lastError: `Not moved to the new automation format: ${conversion.unmigrated}`,
    };
  const identified = identifiedAutomationV2(conversion.automation, randomUUID, false);
  return {
    definition: jsonText(identified),
    origin: conversion.origin,
    disabled: false,
    lastError: null,
  };
}

function convertAutomation(raw: unknown, original: string): Migrated {
  const parsed = AUTOMATION_DEFINITION.safeParse(raw);
  return parsed.success
    ? migrated(automationV2Of(parsed.data), original)
    : migrated({ unmigrated: issuesOf(parsed.error) }, original);
}

function convertSequence(raw: unknown, original: string): Migrated {
  const parsed = AUTOMATION_SEQUENCE_DEFINITION.safeParse(raw);
  return parsed.success
    ? migrated(sequenceV2Of(parsed.data), original)
    : migrated({ unmigrated: issuesOf(parsed.error) }, original);
}

function updateAutomation(sql: Sql, id: string, result: Migrated, original: string): void {
  sql.run(
    'move the automation to the new format',
    `update automations set definition = $definition, origin = $origin, definition_v1 = $original,
       enabled = case when $disabled then 0 else enabled end,
       last_error = coalesce($lastError, case when last_error like '%permission record was removed%' then null else last_error end)
     where id = $id`,
    {
      id,
      definition: result.definition,
      origin: result.origin === null ? null : jsonText(result.origin),
      original,
      disabled: flag(result.disabled),
      lastError: result.lastError,
    },
  );
}

function freeName(sql: Sql, wanted: string): string {
  const taken = (name: string): boolean =>
    sql.get(NAME, 'select name from automations where name = $name', { name }) !== undefined;
  for (let attempt = 0; ; attempt += 1) {
    const suffix = attempt === 0 ? '' : ` (steps ${String(attempt)})`;
    const name = `${wanted.slice(0, NAME_LENGTH - suffix.length)}${suffix}`;
    if (!taken(name)) return name;
  }
}

function insertSequence(sql: Sql, sequence: z.infer<typeof SEQUENCE>): boolean {
  const original = jsonText(sequence.definition);
  const result = convertSequence(sequence.definition, original);
  sql.run(
    'move the sequence into the automations',
    `insert into automations (id, name, enabled, definition, origin, definition_v1, last_error, created_at, updated_at)
     values ($id, $name, $enabled, $definition, $origin, $original, $lastError, $created, $updated)`,
    {
      id: sequence.id,
      name: freeName(sql, sequence.name),
      enabled: flag(!result.disabled),
      definition: result.definition,
      origin: result.origin === null ? null : jsonText(result.origin),
      original,
      lastError: result.lastError,
      created: sequence.created_at,
      updated: sequence.updated_at,
    },
  );
  return !result.disabled;
}

function retargetSpeech(sql: Sql): void {
  sql.run(
    'keep speech triggers listening',
    `update automation_speech_grants set revision = '1'
     where automation_id in (select id from automations where definition_v1 is not null and last_error is null)`,
  );
  sql.run(
    'keep speech admissions',
    `update automation_speech_occurrences set revision = '1'
     where automation_id in (select id from automations where definition_v1 is not null and last_error is null)`,
  );
}

export function moveAutomationsToV2(sql: Sql): LogPayload {
  let moved = 0;
  const automations = sql.all(AUTOMATION, 'select id, name, definition from automations');
  for (const automation of automations) {
    const original = jsonText(automation.definition);
    const result = convertAutomation(automation.definition, original);
    updateAutomation(sql, automation.id, result, original);
    if (!result.disabled) moved += 1;
  }
  const sequences = sql.all(
    SEQUENCE,
    'select id, name, definition, created_at, updated_at from automation_sequences',
  );
  for (const sequence of sequences) if (insertSequence(sql, sequence)) moved += 1;
  retargetSpeech(sql);
  sql.run(
    'move sequence authority to automations',
    "update harness_effect_authorities set kind = 'automation' where kind = 'sequence'",
  );
  sql.database.exec('drop table automation_sequences');
  return {
    automations: automations.length,
    sequences: sequences.length,
    unmigrated: automations.length + sequences.length - moved,
  };
}
