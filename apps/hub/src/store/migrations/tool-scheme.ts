import { isMcpToolName, JSON_VALUE, PLUGIN_TOOL_SEPARATOR } from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { planHashOf } from '../repositories/automation-plans';
import { jsonText, type Sql } from '../sql';
import type { Migration } from './migration';
import { PLAN_REFERENCES, SOURCES, STORED } from './port-wires-sources';
import { currentCall, currentGrantNames } from './tool-scheme-calls';
import { rewritten, ToolCallLeftError, type CallConversion } from './tool-scheme-rewrite';

const TEXT_ROW = z.object({ id: z.string(), text: z.string() });
const NAMES = z.array(z.string());
const PLAN_ROW = z.object({ hash: z.string(), text: z.string() });
const SCHEDULE_ROW = z.object({ id: z.string(), text: z.string() });

function stillServed(name: string): boolean {
  return isMcpToolName(name) || name.includes(PLUGIN_TOOL_SEPARATOR);
}

function grantNames(names: readonly string[]): string[] {
  return [...new Set(names.flatMap(currentGrantNames).filter(stillServed))];
}

function moveDisabledTools(sql: Sql): LogPayload {
  const rows = sql.all(TEXT_ROW, "select '1' as id, mcp_disabled_tools as text from settings");
  for (const row of rows) {
    sql.run(
      'move the switched-off tools to their current names',
      'update settings set mcp_disabled_tools = $names',
      { names: jsonText(grantNames(NAMES.parse(JSON.parse(row.text)))) },
    );
  }
  return { settings: rows.length };
}

function moveChatTools(sql: Sql): LogPayload {
  const rows = sql.all(TEXT_ROW, 'select id, tools as text from ai_chats where tools is not null');
  for (const row of rows) {
    sql.run(
      'move a chat’s tool grant to the current names',
      'update ai_chats set tools = $names where id = $id',
      {
        id: row.id,
        names: jsonText(grantNames(NAMES.parse(JSON.parse(row.text)))),
      },
    );
  }
  return { chats: rows.length };
}

function shownName(name: string): string {
  return currentCall({ tool: name, args: {} })?.tool ?? name;
}

function moveMessageSteps(sql: Sql): LogPayload {
  const rows = sql.all(
    TEXT_ROW,
    "select id, steps as text from assistant_messages where steps != '[]'",
  );
  let moved = 0;
  for (const row of rows) {
    const steps = NAMES.safeParse(JSON.parse(row.text));
    if (!steps.success) continue;
    const next = steps.data.map(shownName);
    if (JSON.stringify(next) === JSON.stringify(steps.data)) continue;
    moved += sql.run(
      'name a message’s tool steps by their current tools',
      'update assistant_messages set steps = $steps where id = $id',
      {
        id: row.id,
        steps: jsonText(next),
      },
    );
  }
  return { messages: moved };
}

interface Pass {
  readonly writes: (() => number)[];
  readonly left: string[];
  readonly calls: number[];
}

function planned(
  pass: Pass,
  convert: CallConversion,
  owner: string,
  text: string,
  write: (json: string) => number,
): void {
  const result = rewritten(JSON_VALUE.parse(JSON.parse(text)), convert);
  pass.left.push(...result.left.map((tool) => `${owner}: ${tool}`));
  if (result.calls === 0) return;
  pass.calls.push(result.calls);
  const json = jsonText(result.value);
  pass.writes.push(() => write(json));
}

function moveSchedules(sql: Sql, pass: Pass, convert: CallConversion): void {
  for (const row of sql.all(SCHEDULE_ROW, 'select id, steps as text from scheduled_actions')) {
    planned(pass, convert, `the scheduled action ${row.id}`, row.text, (steps) =>
      sql.run(
        'move scheduled tool steps to the current tools',
        'update scheduled_actions set steps = $steps where id = $id',
        { id: row.id, steps },
      ),
    );
  }
}

function moveAutomations(sql: Sql, pass: Pass, convert: CallConversion): void {
  for (const source of SOURCES) {
    for (const row of sql.all(STORED, source.select)) {
      const key = source.byRevision ? { id: row.id, revision: row.revision } : { id: row.id };
      planned(pass, convert, row.owner, row.text, (text) =>
        sql.run(`move the tool calls of ${row.owner}`, source.update, { ...key, text }),
      );
    }
  }
}

function movePlan(sql: Sql, hash: string, text: string): number {
  const next = planHashOf(JSON_VALUE.parse(JSON.parse(text)));
  sql.run(
    'keep the compiled plan with the current tool names',
    `insert into automation_plans (hash, kind, json, created_at)
     select $next, kind, $text, created_at from automation_plans where hash = $hash
     on conflict (hash) do nothing`,
    { hash, next, text },
  );
  for (const statement of PLAN_REFERENCES) {
    sql.run('point at the compiled plan with the current tool names', statement, { hash, next });
  }
  return sql.run(
    'drop the compiled plan with the old tool names',
    'delete from automation_plans where hash = $hash',
    { hash },
  );
}

function movePlans(sql: Sql, pass: Pass, convert: CallConversion): void {
  for (const row of sql.all(PLAN_ROW, 'select hash, json as text from automation_plans')) {
    planned(pass, convert, `a compiled automation plan ${row.hash.slice(0, 12)}`, row.text, (text) =>
      movePlan(sql, row.hash, text),
    );
  }
}

export function moveStoredCalls(
  sql: Sql,
  convert: CallConversion,
): { readonly calls: number; readonly rows: number } {
  const pass: Pass = { writes: [], left: [], calls: [] };
  moveSchedules(sql, pass, convert);
  moveAutomations(sql, pass, convert);
  movePlans(sql, pass, convert);
  if (pass.left.length > 0) throw new ToolCallLeftError(pass.left);
  return {
    calls: pass.calls.reduce((sum, count) => sum + count, 0),
    rows: pass.writes.reduce((sum, write) => sum + write(), 0),
  };
}

export function moveToolScheme(sql: Sql): LogPayload {
  const moved = moveStoredCalls(sql, currentCall);
  const toolSet = sql.run(
    'delete the unused tool set row',
    "delete from ai_settings where key = 'tool_set'",
  );
  return {
    ...moved,
    toolSet,
    ...moveDisabledTools(sql),
    ...moveChatTools(sql),
    ...moveMessageSteps(sql),
  };
}

export const TOOL_SCHEME_MIGRATION: Migration = {
  version: 135,
  name: 'tool_scheme',
  statements: [],
  backfill: moveToolScheme,
};
