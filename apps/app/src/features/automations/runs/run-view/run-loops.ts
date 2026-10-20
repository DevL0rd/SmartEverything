import type { Activation } from './run-activation';

export type Outcome = 'ok' | 'failed' | 'running';

export interface LoopInfo {
  readonly nodeId: string;
  readonly iterations: readonly number[];
  readonly outcomes: readonly Outcome[];
  readonly chosen: number;
  readonly position: number;
  readonly total: number;
}

export interface LoopChoice {
  readonly loops: readonly LoopInfo[];
  readonly chosen: ReadonlyMap<string, number>;
}

function depthsOf(activations: readonly Activation[]): readonly string[] {
  const depth = new Map<string, number>();
  for (const activation of activations) {
    activation.loops.forEach((frame, index) => {
      depth.set(frame.nodeId, Math.min(depth.get(frame.nodeId) ?? index, index));
    });
  }
  return [...depth].sort((left, right) => left[1] - right[1]).map(([id]) => id);
}

function inside(activation: Activation, chosen: ReadonlyMap<string, number>): boolean {
  return activation.loops.every((frame) => {
    const picked = chosen.get(frame.nodeId);
    return picked === undefined || picked === frame.iteration;
  });
}

function outcomeOf(activations: readonly Activation[]): Outcome {
  if (activations.some((activation) => activation.status === 'failed')) return 'failed';
  const open = activations.some(
    (activation) => activation.status === 'running' || activation.status === 'waiting',
  );
  return open ? 'running' : 'ok';
}

function infoOf(
  nodeId: string,
  activations: readonly Activation[],
  picked: number | undefined,
): LoopInfo | null {
  const iterations = [
    ...new Set(
      activations.flatMap((activation) =>
        activation.loops.filter((frame) => frame.nodeId === nodeId).map((frame) => frame.iteration),
      ),
    ),
  ].sort((left, right) => left - right);
  const last = iterations.at(-1);
  if (last === undefined) return null;
  const chosen = picked !== undefined && iterations.includes(picked) ? picked : last;
  const outcomes = iterations.map((iteration) =>
    outcomeOf(
      activations.filter((activation) =>
        activation.loops.some((frame) => frame.nodeId === nodeId && frame.iteration === iteration),
      ),
    ),
  );
  return {
    nodeId,
    iterations,
    outcomes,
    chosen,
    position: iterations.indexOf(chosen) + 1,
    total: iterations.length,
  };
}

export function resolveLoops(
  activations: readonly Activation[],
  selected: ReadonlyMap<string, number>,
): LoopChoice {
  const chosen = new Map<string, number>();
  const loops: LoopInfo[] = [];
  for (const nodeId of depthsOf(activations)) {
    const within = activations.filter(
      (activation) =>
        inside(activation, chosen) && activation.loops.some((frame) => frame.nodeId === nodeId),
    );
    const info = infoOf(nodeId, within, selected.get(nodeId));
    if (info === null) continue;
    loops.push(info);
    chosen.set(nodeId, info.chosen);
  }
  return { loops, chosen };
}

function sameLoop(left: LoopInfo, right: LoopInfo): boolean {
  return (
    left.nodeId === right.nodeId &&
    left.chosen === right.chosen &&
    left.iterations.length === right.iterations.length &&
    left.iterations.every((iteration, index) => iteration === right.iterations[index]) &&
    left.outcomes.every((outcome, index) => outcome === right.outcomes[index])
  );
}

export function sameLoops(left: readonly LoopInfo[], right: readonly LoopInfo[]): boolean {
  return (
    left.length === right.length &&
    left.every((info, index) => {
      const other = right[index];
      return other !== undefined && sameLoop(info, other);
    })
  );
}

export function shownIn(activation: Activation, chosen: ReadonlyMap<string, number>): boolean {
  return inside(activation, chosen);
}

export type StripItem =
  | { readonly kind: 'pass'; readonly position: number; readonly outcome: Outcome }
  | {
      readonly kind: 'gap';
      readonly from: number;
      readonly to: number;
      readonly ok: number;
      readonly failed: number;
    };

const STRIP_EDGE = 6;

function visiblePositions(info: LoopInfo): ReadonlySet<number> {
  const shown = new Set<number>([info.position]);
  for (let step = 1; step <= STRIP_EDGE; step += 1) {
    shown.add(step);
    shown.add(info.total + 1 - step);
  }
  return shown;
}

function gapOf(info: LoopInfo, from: number, to: number): StripItem {
  const span = info.outcomes.slice(from - 1, to);
  return {
    kind: 'gap',
    from,
    to,
    ok: span.filter((outcome) => outcome === 'ok').length,
    failed: span.filter((outcome) => outcome === 'failed').length,
  };
}

export function stripOf(info: LoopInfo): readonly StripItem[] {
  const shown = visiblePositions(info);
  const items: StripItem[] = [];
  let skippedFrom: number | null = null;
  for (let position = 1; position <= info.total; position += 1) {
    if (!shown.has(position)) {
      skippedFrom ??= position;
      continue;
    }
    if (skippedFrom !== null) items.push(gapOf(info, skippedFrom, position - 1));
    skippedFrom = null;
    items.push({ kind: 'pass', position, outcome: info.outcomes[position - 1] ?? 'ok' });
  }
  return items;
}

export function gapText(item: Extract<StripItem, { kind: 'gap' }>): string {
  const failed = item.failed === 0 ? '' : `, ${String(item.failed)} failed`;
  return `passes ${String(item.from)} to ${String(item.to)}: ${String(item.ok)} ok${failed}`;
}
