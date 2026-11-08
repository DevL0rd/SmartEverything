import { z } from 'zod';
import {
  EMPTY_LAYOUT,
  JSON_VALUE,
  NODE_REGISTRY,
  STATIC_KIND_LOOKUP,
  STARTER_NODES,
  type JsonValue,
  type StarterNode,
} from '@smarteverything/domain';
import { canonicalPlan } from '@smarteverything/flow/compile/hash';
import { lower } from '@smarteverything/flow/compile/lower';
import { interfaceHash, interfaceOf } from '@smarteverything/flow/functions/interface-hash';
import { completeLayout } from '@smarteverything/flow/graph/place-new';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import type { LogPayload } from '@smarteverything/logging';
import { canonicalPlanText, planHashOf } from '../repositories/automation-plans';
import { jsonText, type Sql } from '../sql';
import type { Migration } from './migration';

const ROW = z.object({ id: z.string() });

class StarterNodeError extends Error {
  override readonly name = 'StarterNodeError';

  constructor(node: StarterNode, detail: string) {
    super(`The starter Custom Node ${node.name} cannot be installed: ${detail}.`);
  }
}

function planOf(node: StarterNode): JsonValue {
  const structured = structuredOf(node.program, STATIC_KIND_LOOKUP);
  if (structured.kind === 'unstructured') {
    throw new StarterNodeError(node, structured.problems.map((found) => found.message).join('; '));
  }
  const lowered = lower(structured.tree, { kinds: (id) => NODE_REGISTRY.get(id) });
  if (!lowered.ok) {
    throw new StarterNodeError(node, lowered.problems.map((found) => found.message).join('; '));
  }
  return JSON_VALUE.parse(JSON.parse(canonicalPlan(lowered.plan)));
}

function taken(sql: Sql, column: 'id' | 'name', value: string): boolean {
  return (
    sql.get(ROW, `select id from automation_functions where ${column} = $value`, { value }) !==
    undefined
  );
}

function freeName(sql: Sql, name: string): string {
  let candidate = name;
  for (let suffix = 2; taken(sql, 'name', candidate); suffix += 1) {
    candidate = `${name} ${String(suffix)}`;
  }
  return candidate;
}

function keepPlan(sql: Sql, plan: JsonValue, now: string): string {
  const hash = planHashOf(plan);
  sql.run(
    'keep the starter Custom Node plan',
    `insert into automation_plans (hash, kind, json, created_at)
     values ($hash, 'function', $json, $now) on conflict (hash) do nothing`,
    { hash, json: canonicalPlanText(plan), now },
  );
  return hash;
}

function install(sql: Sql, node: StarterNode, now: string): string {
  const { program } = node;
  const name = freeName(sql, node.name);
  sql.run(
    'add the starter Custom Node',
    `insert into automation_functions
       (id, name, description, category, icon, latest_revision, created_by, author, created_at, updated_at)
     values ($id, $name, $description, $category, $icon, 1, null, null, $now, $now)`,
    {
      id: node.id,
      name,
      description: program.description ?? null,
      category: program.category ?? null,
      icon: program.icon ?? null,
      now,
    },
  );
  sql.run(
    'keep the starter Custom Node revision',
    `insert into automation_function_revisions
       (function_id, revision, definition, layout, interface_hash, compat, plan_hash, saved_at, author)
     values ($id, 1, $definition, $layout, $interfaceHash, 'compatible', $planHash, $now, null)`,
    {
      id: node.id,
      definition: jsonText(program),
      layout: jsonText(
        completeLayout(program, EMPTY_LAYOUT, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' }),
      ),
      interfaceHash: interfaceHash(interfaceOf(program)),
      planHash: keepPlan(sql, planOf(node), now),
      now,
    },
  );
  return name;
}

function installAll(sql: Sql, now: string): LogPayload {
  const present = STARTER_NODES.filter((node) => taken(sql, 'id', node.id));
  const installed = STARTER_NODES.filter((node) => !present.includes(node)).map((node) =>
    install(sql, node, now),
  );
  return { installed: installed.length, names: installed, present: present.length };
}

export const STARTER_CUSTOM_NODES_MIGRATION: Migration = {
  version: 154,
  name: 'starter-custom-nodes',
  statements: [],
  backfill: installAll,
};
