import type { RunOverlay } from '../../model/canvas/contract';
import { clock } from '../../../../format/time';
import type { Activation, ActivationStatus } from './run-activation';
import { shownIn, type LoopInfo, type Outcome } from './run-loops';
import { previewText } from './run-values';

type RunState = RunOverlay[string]['state'];

const STATE_OF: Readonly<Record<ActivationStatus, RunState>> = {
  running: 'running',
  waiting: 'waiting',
  succeeded: 'done',
  failed: 'failed',
  skipped: 'skipped',
  cancelled: 'skipped',
};

const STATE_OF_OUTCOME: Readonly<Record<Outcome, RunState>> = {
  ok: 'done',
  failed: 'failed',
  running: 'running',
};

export const DEFAULT_ITEM_NAME = 'Time';

export interface OverlayInput {
  readonly activations: readonly Activation[];
  readonly chosen: ReadonlyMap<string, number>;
  readonly loops: readonly LoopInfo[];
  readonly itemNames: ReadonlyMap<string, string>;
  readonly at: number | null;
  readonly wakeAt: string | null;
  readonly zone: string | null;
}

export function statusAt(activation: Activation, at: number | null): ActivationStatus | null {
  if (at === null) return activation.status;
  const start = activation.startMs ?? activation.endMs ?? 0;
  if (start > at) return null;
  if (activation.endMs !== null) {
    return activation.endMs <= at ? activation.status : 'running';
  }
  return activation.status === 'waiting' ? 'waiting' : activation.status;
}

function textOf(
  activation: Activation,
  status: ActivationStatus,
  input: OverlayInput,
): string | undefined {
  if (status === 'failed') return activation.error ?? 'Failed';
  if (status === 'waiting') {
    return input.wakeAt === null ? 'Waiting' : `wakes at ${clock(input.wakeAt, input.zone)}`;
  }
  if (status === 'succeeded' || status === 'running') return previewText(activation);
  return undefined;
}

function nodeOf(
  activation: Activation,
  status: ActivationStatus,
  input: OverlayInput,
): RunOverlay[string] {
  const text = textOf(activation, status, input);
  return {
    state: STATE_OF[status],
    ...(text === undefined ? {} : { text }),
  };
}

function latestPerNode(input: OverlayInput): Map<string, RunOverlay[string]> {
  const latest = new Map<string, { readonly seq: number; readonly node: RunOverlay[string] }>();
  for (const activation of input.activations) {
    if (!shownIn(activation, input.chosen)) continue;
    const status = statusAt(activation, input.at);
    if (status === null) continue;
    const held = latest.get(activation.nodeId);
    if (held !== undefined && held.seq > activation.seq) continue;
    latest.set(activation.nodeId, { seq: activation.seq, node: nodeOf(activation, status, input) });
  }
  return new Map([...latest].map(([id, entry]) => [id, entry.node]));
}

function loopNode(
  info: LoopInfo,
  base: RunOverlay[string] | undefined,
  names: ReadonlyMap<string, string>,
): RunOverlay[string] {
  const name = names.get(info.nodeId) ?? DEFAULT_ITEM_NAME;
  const outcome = info.outcomes[info.position - 1] ?? 'ok';
  const state = base?.state ?? STATE_OF_OUTCOME[outcome];
  const text =
    base?.state === 'failed' && base.text !== undefined
      ? base.text
      : `${name} ${String(info.position)} of ${String(info.total)}`;
  return { state, text, iteration: info.position };
}

export function overlayOf(input: OverlayInput): RunOverlay {
  const nodes = latestPerNode(input);
  for (const info of input.loops) {
    nodes.set(info.nodeId, loopNode(info, nodes.get(info.nodeId), input.itemNames));
  }
  return Object.fromEntries(nodes);
}

export function activationFor(
  activations: readonly Activation[],
  chosen: ReadonlyMap<string, number>,
  nodeId: string | null,
): Activation | null {
  if (nodeId === null) return null;
  const shown = activations.filter(
    (activation) => activation.nodeId === nodeId && shownIn(activation, chosen),
  );
  return shown.reduce<Activation | null>(
    (best, next) => (best === null || next.seq > best.seq ? next : best),
    null,
  );
}

export function runningNodeOf(
  activations: readonly Activation[],
  chosen: ReadonlyMap<string, number>,
): string | null {
  const running = activations.filter(
    (activation) => activation.status === 'running' && shownIn(activation, chosen),
  );
  return (
    running.reduce<Activation | null>(
      (best, next) => (best === null || next.seq > best.seq ? next : best),
      null,
    )?.nodeId ?? null
  );
}
