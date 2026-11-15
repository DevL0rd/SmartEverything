import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { canonicalPlanText, planHashOf } from '../repositories/automation-plans';
import { jsonText, type Sql } from '../sql';
import { PLAN_REFERENCES, SOURCES, STORED } from './port-wires-sources';

const SCENE_RUN = 'scene.run';

const SCENE_CAPTURE = 'scene.capture';

const SCENE_KINDS: ReadonlySet<string> = new Set([SCENE_RUN, SCENE_CAPTURE]);

export const SCENE_TOOLS: ReadonlySet<string> = new Set(['scene_run', 'scene_find', 'scene_edit']);

const PLAN_ROW = z.object({ hash: z.string(), text: z.string() });

const NODE = z.looseObject({
  key: z.string(),
  kind: z.string(),
  ports: z.record(z.string(), z.unknown()).optional(),
  to: z.record(z.string(), z.string()).optional(),
});

type GraphNode = z.output<typeof NODE>;

const ROW_LISTS = ['branches', 'cases', 'catches', 'paths'] as const;

const LITERAL_ID = z.strictObject({ lit: z.string() });

const SCENE_ARGS = z.strictObject({ lit: z.strictObject({ sceneId: z.string() }) });

const SCHEDULE_ROW = z.object({ id: z.string(), text: z.string() });

const STEP = z.looseObject({ kind: z.string(), tool: z.string().optional(), args: z.unknown() });

const WIRE = z.looseObject({ wire: z.looseObject({ from: z.string() }) });

export class SceneNodeLeftError extends Error {
  override readonly name = 'SceneNodeLeftError';

  constructor(readonly left: readonly string[]) {
    super(
      `Scenes cannot be moved to automations while these still depend on a scene node: ${left.join('; ')}. Nothing was migrated.`,
    );
  }
}

class Pass {
  readonly problems: string[] = [];
  private readonly counts = { runs: 0, captures: 0, tools: 0 };

  count(kind: 'runs' | 'captures' | 'tools', by = 1): void {
    this.counts[kind] += by;
  }

  payload(): {
    readonly sceneRuns: number;
    readonly sceneCaptures: number;
    readonly sceneTools: number;
  } {
    return {
      sceneRuns: this.counts.runs,
      sceneCaptures: this.counts.captures,
      sceneTools: this.counts.tools,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sceneRef(value: Record<string, unknown>): Record<string, unknown> {
  return value['t'] === 'ref' && value['of'] === 'scene' ? { ...value, of: 'automation' } : value;
}

function wiredFrom(value: unknown, keys: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.some((entry) => wiredFrom(entry, keys));
  if (!isRecord(value)) return false;
  const wire = WIRE.safeParse(value);
  if (wire.success && keys.has(wire.data.wire.from)) return true;
  return Object.values(value).some((entry) => wiredFrom(entry, keys));
}

function nextOf(key: string, skips: ReadonlyMap<string, string | undefined>): string | undefined {
  const seen = new Set<string>();
  let current: string | undefined = key;
  while (current !== undefined && skips.has(current) && !seen.has(current)) {
    seen.add(current);
    current = skips.get(current);
  }
  return current;
}

function retargetRows(rows: unknown, skips: ReadonlyMap<string, string | undefined>): unknown {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row: unknown) => {
    if (!isRecord(row) || typeof row['to'] !== 'string') return row;
    const { to, ...rest } = row;
    const next = nextOf(to, skips);
    return next === undefined ? rest : { ...rest, to: next };
  });
}

function retarget(node: GraphNode, skips: ReadonlyMap<string, string | undefined>): GraphNode {
  if (skips.size === 0) return node;
  const moved: Record<string, unknown> = { ...node };
  if (node.to !== undefined) {
    moved['to'] = Object.fromEntries(
      Object.entries(node.to).flatMap(([exit, key]) => {
        const next = nextOf(key, skips);
        return next === undefined ? [] : [[exit, next]];
      }),
    );
  }
  for (const list of ROW_LISTS) {
    if (list in moved) moved[list] = retargetRows(moved[list], skips);
  }
  return NODE.parse(moved);
}

function automationRun(node: GraphNode, owner: string, pass: Pass): GraphNode {
  const scene = LITERAL_ID.safeParse(node.ports?.['scene']);
  if (!scene.success) {
    pass.problems.push(`${owner}: the Run scene node ${node.key} does not name one scene`);
    return node;
  }
  pass.count('runs');
  return { ...node, kind: 'automation.run', ports: { automation: scene.data } };
}

function sceneToolPorts(
  ports: Readonly<Record<string, unknown>>,
  owner: string,
  pass: Pass,
): Record<string, unknown> {
  const tool = LITERAL_ID.safeParse(ports['tool']);
  if (!tool.success || !SCENE_TOOLS.has(tool.data.lit)) return { ...ports };
  const args = SCENE_ARGS.safeParse(ports['args']);
  if (tool.data.lit !== 'scene_run' || !args.success) {
    pass.problems.push(`${owner}: a Use a tool step calls ${tool.data.lit}`);
    return { ...ports };
  }
  pass.count('tools');
  return {
    ...ports,
    tool: { lit: 'automation_run' },
    args: { lit: { automationId: args.data.lit.sceneId } },
  };
}

function sceneFreeNodes(entries: readonly unknown[], owner: string, pass: Pass): unknown[] {
  const scenes = entries.flatMap((entry) => {
    const node = NODE.safeParse(entry);
    return node.success && SCENE_KINDS.has(node.data.kind) ? [node.data] : [];
  });
  if (scenes.length === 0) return [...entries];
  if (wiredFrom(entries, new Set(scenes.map((node) => node.key)))) {
    pass.problems.push(`${owner}: a node reads a value from a scene node`);
  }
  const skips = new Map(
    scenes
      .filter((node) => node.kind === SCENE_CAPTURE)
      .map((node) => [node.key, node.to?.['next']]),
  );
  pass.count('captures', skips.size);
  return entries.flatMap((entry) => {
    const node = NODE.safeParse(entry);
    if (!node.success) return [entry];
    if (node.data.kind === SCENE_CAPTURE) return [];
    const moved = node.data.kind === SCENE_RUN ? automationRun(node.data, owner, pass) : node.data;
    return [retarget(moved, skips)];
  });
}

function sceneFreeProgram(value: unknown, owner: string, pass: Pass): unknown {
  if (Array.isArray(value)) return value.map((entry) => sceneFreeProgram(entry, owner, pass));
  if (!isRecord(value)) return value;
  const walked = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sceneFreeProgram(entry, owner, pass)]),
  );
  const nodes = walked['nodes'];
  if (Array.isArray(nodes)) walked['nodes'] = sceneFreeNodes(nodes, owner, pass);
  if (walked['kind'] === 'tool.call' && isRecord(walked['ports'])) {
    walked['ports'] = sceneToolPorts(walked['ports'], owner, pass);
  }
  return sceneRef(walked);
}

function runOp(op: Record<string, unknown>, owner: string, pass: Pass): unknown {
  const params = isRecord(op['params']) ? op['params'] : {};
  const scene = LITERAL_ID.safeParse(params['scene']);
  if (!scene.success || op['scopes'] !== undefined) {
    pass.problems.push(`${owner}: a Run scene step cannot become a Run automation step`);
    return op;
  }
  pass.count('runs');
  return {
    op: 'run',
    at: op['at'],
    ...(op['policy'] === undefined ? {} : { policy: op['policy'] }),
    automation: scene.data.lit,
    wait: false,
    allowSelf: false,
    inputs: {},
    detached: true,
  };
}

function isCaptureOp(value: unknown): boolean {
  return isRecord(value) && value['op'] === 'effect' && value['kind'] === SCENE_CAPTURE;
}

function sceneFreePlan(value: unknown, owner: string, pass: Pass): unknown {
  if (Array.isArray(value)) {
    const kept = value.filter((entry) => !isCaptureOp(entry));
    pass.count('captures', value.length - kept.length);
    return kept.map((entry) => sceneFreePlan(entry, owner, pass));
  }
  if (!isRecord(value)) return value;
  if (isCaptureOp(value)) {
    pass.problems.push(`${owner}: a Save current look step is not part of a sequence`);
    return value;
  }
  const walked = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sceneFreePlan(entry, owner, pass)]),
  );
  if (walked['op'] === 'effect' && walked['kind'] === SCENE_RUN) return runOp(walked, owner, pass);
  if (walked['op'] === 'effect' && walked['kind'] === 'tool.call' && isRecord(walked['params'])) {
    walked['params'] = sceneToolPorts(walked['params'], owner, pass);
  }
  return sceneRef(walked);
}

function mentionsScenes(text: string): boolean {
  return text.includes('"scene.') || text.includes('"scene_') || text.includes('"of":"scene"');
}

function rewritePrograms(sql: Sql, pass: Pass): number {
  let rows = 0;
  for (const source of SOURCES) {
    for (const row of sql.all(STORED, source.select)) {
      if (!mentionsScenes(row.text)) continue;
      const next = jsonText(
        JSON_VALUE.parse(sceneFreeProgram(JSON.parse(row.text), row.owner, pass)),
      );
      if (next === row.text) continue;
      const key = source.byRevision ? { id: row.id, revision: row.revision } : { id: row.id };
      rows += sql.run(`move the scene nodes of ${row.owner}`, source.update, {
        ...key,
        text: next,
      });
    }
  }
  return rows;
}

function movePlan(sql: Sql, hash: string, plan: JsonValue): void {
  const next = planHashOf(plan);
  sql.run(
    'keep the compiled plan without scenes',
    `insert into automation_plans (hash, kind, json, created_at)
     select $next, kind, $text, created_at from automation_plans where hash = $hash
     on conflict (hash) do nothing`,
    { hash, next, text: canonicalPlanText(plan) },
  );
  for (const statement of PLAN_REFERENCES) {
    sql.run('point at the compiled plan without scenes', statement, { hash, next });
  }
  sql.run('drop the compiled plan with scenes', 'delete from automation_plans where hash = $hash', {
    hash,
  });
}

function rewritePlans(sql: Sql, pass: Pass): number {
  let plans = 0;
  for (const row of sql.all(PLAN_ROW, 'select hash, json as text from automation_plans')) {
    if (!mentionsScenes(row.text)) continue;
    const owner = `the compiled plan ${row.hash.slice(0, 12)}`;
    const plan = JSON_VALUE.parse(sceneFreePlan(JSON.parse(row.text), owner, pass));
    if (canonicalPlanText(plan) === row.text) continue;
    movePlan(sql, row.hash, plan);
    plans += 1;
  }
  return plans;
}

function sceneFreeStep(entry: unknown, owner: string, pass: Pass): unknown {
  const step = STEP.safeParse(entry);
  if (!step.success || step.data.tool === undefined || !SCENE_TOOLS.has(step.data.tool)) {
    return entry;
  }
  const args = SCENE_ARGS.shape.lit.safeParse(step.data.args);
  if (step.data.tool !== 'scene_run' || !args.success) {
    pass.problems.push(`${owner}: a step calls ${step.data.tool}`);
    return entry;
  }
  pass.count('tools');
  return { ...step.data, tool: 'automation_run', args: { automationId: args.data.sceneId } };
}

function rewriteSchedules(sql: Sql, pass: Pass): number {
  let rows = 0;
  for (const row of sql.all(SCHEDULE_ROW, 'select id, steps as text from scheduled_actions')) {
    if (!mentionsScenes(row.text)) continue;
    const owner = `the scheduled action ${row.id}`;
    const steps = z
      .array(z.unknown())
      .parse(JSON.parse(row.text))
      .map((entry) => sceneFreeStep(entry, owner, pass));
    rows += sql.run(
      'move the scene steps of a scheduled action',
      'update scheduled_actions set steps = $steps where id = $id',
      { id: row.id, steps: jsonText(JSON_VALUE.parse(steps)) },
    );
  }
  return rows;
}

export function moveSceneNodes(sql: Sql): LogPayload {
  const pass = new Pass();
  const schedules = rewriteSchedules(sql, pass);
  const programs = rewritePrograms(sql, pass);
  const plans = rewritePlans(sql, pass);
  if (pass.problems.length > 0) throw new SceneNodeLeftError(pass.problems);
  return { programs, plans, schedules, ...pass.payload() };
}
