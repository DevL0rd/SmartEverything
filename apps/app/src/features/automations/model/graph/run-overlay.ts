import { z } from 'zod';
import type { Activation, ActivationStatus } from '../../runs/run-view/run-activation';
import { resolveLoops, shownIn, type LoopInfo, type Outcome } from '../../runs/run-view/run-loops';
import { previewText } from '../../runs/run-view/run-values';
import { clock } from '../../../../format/time';
import type { GraphScene } from './scene-contract';
import { joinProgress, takenWires, type JoinProgress, type TakenInput } from './taken-wires';

const ID = z.string().min(1);

export const GRAPH_RUN_STATES = ['running', 'done', 'failed', 'skipped', 'waiting'] as const;

export const GRAPH_RUN_PROGRESS = z.strictObject({
  done: z.int().min(0),
  total: z.int().min(1),
});

export const GRAPH_RUN_NODE = z.strictObject({
  state: z.enum(GRAPH_RUN_STATES),
  text: z.string().min(1).optional(),
  wakeAt: z.string().min(1).optional(),
  iteration: z.int().min(1).optional(),
  progress: GRAPH_RUN_PROGRESS.optional(),
});

export const GRAPH_RUN_STEPPER = z.strictObject({
  position: z.int().min(1),
  total: z.int().min(1),
  iteration: z.int().min(1),
});

export const GRAPH_RUN_OVERLAY = z.strictObject({
  version: z.literal(1),
  live: z.boolean(),
  nodes: z.record(ID, GRAPH_RUN_NODE),
  taken: z.array(ID),
  stepper: z.record(ID, GRAPH_RUN_STEPPER),
});

export type GraphRunState = (typeof GRAPH_RUN_STATES)[number];
export type GraphRunNode = z.infer<typeof GRAPH_RUN_NODE>;
export type GraphRunStepper = z.infer<typeof GRAPH_RUN_STEPPER>;
export type GraphRunOverlay = z.infer<typeof GRAPH_RUN_OVERLAY>;

export const EMPTY_GRAPH_RUN_OVERLAY: GraphRunOverlay = {
  version: 1,
  live: false,
  nodes: {},
  taken: [],
  stepper: {},
};

export interface GraphRunInput {
  readonly scene: GraphScene;
  readonly records: readonly Activation[];
  readonly selected: ReadonlyMap<string, number>;
  readonly wakeAt: string | null;
  readonly live: boolean;
  readonly zone?: string | null;
}

const STATE_OF: Readonly<Record<ActivationStatus, GraphRunState>> = {
  running: 'running',
  waiting: 'waiting',
  succeeded: 'done',
  failed: 'failed',
  skipped: 'skipped',
  cancelled: 'skipped',
};

const STATE_OF_OUTCOME: Readonly<Record<Outcome, GraphRunState>> = {
  ok: 'done',
  failed: 'failed',
  running: 'running',
};

function textOf(record: Activation, wake: Wake): string | undefined {
  const state = STATE_OF[record.status];
  if (state === 'failed') return record.error ?? 'Failed';
  if (state === 'waiting') {
    return wake.at === null ? 'Waiting' : `wakes at ${clock(wake.at, wake.zone)}`;
  }
  return state === 'done' || state === 'running' ? previewText(record) : undefined;
}

interface Wake {
  readonly at: string | null;
  readonly zone: string | null;
}

function nodeOf(record: Activation, wake: Wake): GraphRunNode {
  const state = STATE_OF[record.status];
  const text = textOf(record, wake);
  return {
    state,
    ...(text === undefined ? {} : { text }),
    ...(state === 'waiting' && wake.at !== null ? { wakeAt: wake.at } : {}),
  };
}

function latestNodes(
  records: readonly Activation[],
  chosen: ReadonlyMap<string, number>,
  wake: Wake,
): Map<string, GraphRunNode> {
  const latest = new Map<string, Activation>();
  for (const record of records) {
    if (!shownIn(record, chosen)) continue;
    const held = latest.get(record.nodeId);
    if (held === undefined || held.seq <= record.seq) latest.set(record.nodeId, record);
  }
  return new Map([...latest].map(([id, record]) => [id, nodeOf(record, wake)]));
}

function loopNode(info: LoopInfo, base: GraphRunNode | undefined): GraphRunNode {
  const outcome = info.outcomes[info.position - 1] ?? 'ok';
  return { ...base, state: base?.state ?? STATE_OF_OUTCOME[outcome], iteration: info.position };
}

function withProgress(
  nodes: Map<string, GraphRunNode>,
  joins: ReadonlyMap<string, JoinProgress>,
): void {
  for (const [id, progress] of joins) {
    if (progress.total < 1 || progress.done === 0) continue;
    const base = nodes.get(id);
    nodes.set(id, { ...base, state: base?.state ?? 'waiting', progress });
  }
}

function stepperOf(loops: readonly LoopInfo[]): Record<string, GraphRunStepper> {
  return Object.fromEntries(
    loops.map((info) => [
      info.nodeId,
      { position: info.position, total: info.total, iteration: info.chosen },
    ]),
  );
}

export function graphRunOverlay(input: GraphRunInput): GraphRunOverlay {
  const { loops, chosen } = resolveLoops(input.records, input.selected);
  const taken: TakenInput = { scene: input.scene, records: input.records, iterations: chosen };
  const nodes = latestNodes(input.records, chosen, {
    at: input.wakeAt,
    zone: input.zone ?? null,
  });
  for (const info of loops) nodes.set(info.nodeId, loopNode(info, nodes.get(info.nodeId)));
  withProgress(nodes, joinProgress(taken));
  return {
    version: 1,
    live: input.live,
    nodes: Object.fromEntries(nodes),
    taken: [...takenWires(taken)],
    stepper: stepperOf(loops),
  };
}
