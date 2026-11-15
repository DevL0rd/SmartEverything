import { randomUUID } from 'node:crypto';
import {
  AUTOMATION_V4,
  EMPTY_LAYOUT,
  JSON_VALUE,
  NODE_REGISTRY,
  STATIC_KIND_LOOKUP,
  type AutomationV4,
  type GraphNode,
} from '@smarteverything/domain';
import { canonicalPlan } from '@smarteverything/flow/compile/hash';
import { lower } from '@smarteverything/flow/compile/lower';
import { completeLayout } from '@smarteverything/flow/graph/place-new';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { canonicalPlanText, planHashOf } from '../repositories/automation-plans';
import { readAutomation } from '../repositories/automation-trees';
import { SQL_JSON, jsonText, type Sql } from '../sql';
import type { Migration } from './migration';
import { moveSceneNodes } from './no-scenes-programs';
import { Tally, moveAttachments, moveEmbeds, moveLayouts, moveTools } from './no-scenes-stored';

const SCENE_ROW = z.object({ id: z.string(), name: z.string(), actions: SQL_JSON });

const ACTION = z.looseObject({ deviceId: z.string(), capability: z.string(), value: JSON_VALUE });

const NAME_ROW = z.object({ id: z.string() });

function freeName(sql: Sql, name: string): string {
  const taken = (candidate: string): boolean =>
    sql.get(NAME_ROW, 'select id from automations where name = $name', { name: candidate }) !==
    undefined;
  let candidate = name;
  for (let suffix = 2; taken(candidate); suffix += 1) {
    const tail = ` ${String(suffix)}`;
    candidate = `${name.slice(0, 80 - tail.length)}${tail}`;
  }
  return candidate;
}

function setNode(action: z.output<typeof ACTION>, index: number, next?: string): GraphNode {
  return {
    id: randomUUID(),
    key: `set${String(index + 1)}`,
    kind: 'device.set',
    ports: {
      target: { lit: { device: action.deviceId } },
      control: { lit: action.capability },
      to: { lit: action.value },
    },
    ...(next === undefined ? {} : { to: { next } }),
  };
}

function sceneProgram(actions: readonly z.output<typeof ACTION>[]): AutomationV4 {
  const keys = actions.map((_, index) => `set${String(index + 1)}`);
  const start: GraphNode = {
    id: randomUUID(),
    key: 'start',
    kind: 'flow.start',
    ...(keys[0] === undefined ? {} : { to: { next: keys[0] } }),
  };
  return AUTOMATION_V4.parse({
    version: 4,
    kind: 'automation',
    triggers: [{ id: randomUUID(), key: 'called', kind: 'trigger.called', ports: {} }],
    inputs: [],
    outputs: [],
    variables: [],
    nodes: [start, ...actions.map((action, index) => setNode(action, index, keys[index + 1]))],
    policy: { mode: 'single' },
  });
}

class SceneProgramError extends Error {
  override readonly name = 'SceneProgramError';

  constructor(name: string, detail: string) {
    super(`The scene ${name} cannot become an automation: ${detail}. Nothing was migrated.`);
  }
}

function keepPlan(sql: Sql, name: string, program: AutomationV4, now: string): string {
  const read = readAutomation(program, STATIC_KIND_LOOKUP);
  if (!read.ok) throw new SceneProgramError(name, read.problems.map((p) => p.message).join('; '));
  const lowered = lower(read.tree, { kinds: (id) => NODE_REGISTRY.get(id) });
  if (!lowered.ok) {
    throw new SceneProgramError(name, lowered.problems.map((p) => p.message).join('; '));
  }
  const plan = JSON_VALUE.parse(JSON.parse(canonicalPlan(lowered.plan)));
  const hash = planHashOf(plan);
  sql.run(
    'keep the plan of an automation made from a scene',
    `insert into automation_plans (hash, kind, json, created_at)
     values ($hash, 'automation', $json, $now) on conflict (hash) do nothing`,
    { hash, json: canonicalPlanText(plan), now },
  );
  return hash;
}

function sceneToAutomation(sql: Sql, scene: z.output<typeof SCENE_ROW>, now: string): void {
  const actions = z.array(ACTION).parse(scene.actions);
  const program = sceneProgram(actions);
  const layout = completeLayout(program, EMPTY_LAYOUT, {
    kinds: STATIC_KIND_LOOKUP,
    direction: 'ltr',
  });
  const planHash = keepPlan(sql, scene.name, program, now);
  sql.run(
    'add an automation made from a scene',
    `insert into automations (id, name, enabled, definition, layout, origin, author, created_at, updated_at)
     values ($id, $name, 1, $definition, $layout, null, null, $now, $now)`,
    {
      id: scene.id,
      name: freeName(sql, scene.name),
      definition: jsonText(program),
      layout: jsonText(layout),
      now,
    },
  );
  sql.run(
    'keep the first revision of an automation made from a scene',
    `insert into automation_revisions (automation_id, revision, definition, layout, plan_hash, saved_at, author)
     values ($id, 1, $definition, $layout, $planHash, $now, null)`,
    {
      id: scene.id,
      definition: jsonText(program),
      layout: jsonText(layout),
      planHash,
      now,
    },
  );
}

const PLANNER_STATEMENTS: readonly string[] = [
  'alter table planner_alarms rename column wake_scene_id to wake_automation_id',
  `update planner_preferences set preferences = json_remove(
     json_set(preferences, '$.clock.wake_automation_id', json_extract(preferences, '$.clock.wake_scene_id')),
     '$.clock.wake_scene_id'
   ) where json_type(preferences, '$.clock.wake_scene_id') is not null`,
  `update planner_preferences set preferences = json_remove(
     json_set(preferences, '$.bedtime.wind_down_automation_id', json_extract(preferences, '$.bedtime.wind_down_scene_id')),
     '$.bedtime.wind_down_scene_id'
   ) where json_type(preferences, '$.bedtime.wind_down_scene_id') is not null`,
];

const COMMAND_STATEMENTS: readonly string[] = [
  `create table commands_next (
    id text primary key,
    device_id text references devices (id) on delete cascade,
    capability text not null check (length(capability) > 0),
    value text not null default 'null' check (json_valid(value)),
    status text not null default 'pending'
      check (status in ('pending', 'running', 'succeeded', 'failed', 'expired')),
    source text not null default 'app' check (source in ('app', 'automation', 'assistant')),
    result text not null default 'null' check (json_valid(result)),
    error text,
    requested_by text references clients (id) on delete set null,
    created_at text not null,
    started_at text,
    finished_at text,
    expires_at text not null,
    effect_policy text not null default 'keep'
  ) strict`,
  `insert into commands_next (id, device_id, capability, value, status, source, result, error,
     requested_by, created_at, started_at, finished_at, expires_at, effect_policy)
   select id, device_id, capability, value, status,
     case when source = 'scene' then 'automation' else source end,
     result, error, requested_by, created_at, started_at, finished_at, expires_at, effect_policy
   from commands`,
  'drop table commands',
  'alter table commands_next rename to commands',
  'create index commands_open_idx on commands (status, created_at)',
  'create index commands_recent_idx on commands (created_at)',
];

function runAll(sql: Sql, label: string, statements: readonly string[]): void {
  for (const statement of statements) sql.run(label, statement);
}

export function removeScenes(sql: Sql, now: string): LogPayload {
  const counts = new Tally();
  for (const scene of sql.all(
    SCENE_ROW,
    'select id, name, actions from scenes order by position, name',
  )) {
    sceneToAutomation(sql, scene, now);
    counts.add('scenes');
  }
  const nodes = moveSceneNodes(sql);
  moveLayouts(sql, counts);
  moveEmbeds(sql, counts);
  moveAttachments(sql, counts);
  moveTools(sql, counts);
  runAll(sql, 'move the planner wake scenes to automations', PLANNER_STATEMENTS);
  runAll(sql, 'drop the scene command source', COMMAND_STATEMENTS);
  sql.run('drop the scenes table', 'drop table scenes');
  return { ...counts.payload(), ...nodes };
}

export const NO_SCENES_MIGRATION: Migration = {
  version: 211,
  name: 'no-scenes',
  foreignKeys: 'off',
  statements: [],
  backfill: removeScenes,
};
