import type { RunNodeRecord, TraceNodeState } from '@smarteverything/domain';

export type ActivationStatus = RunNodeRecord['status'];

export type Preview = Readonly<Record<string, unknown>>;

export interface LoopFrame {
  readonly nodeId: string;
  readonly iteration: number;
}

export interface Activation {
  readonly path: string;
  readonly nodeId: string;
  readonly loops: readonly LoopFrame[];
  readonly iteration: number;
  readonly status: ActivationStatus;
  readonly seq: number;
  readonly startMs: number | null;
  readonly endMs: number | null;
  readonly preview: Preview | null;
  readonly truncated: boolean;
  readonly error: string | null;
  readonly commandIds: readonly string[];
}

const FRAME = /^[a-z_]+#([^[\]/]+)(?:\[(\d+)\])?$/;

export interface ParsedPath {
  readonly nodeId: string;
  readonly loops: readonly LoopFrame[];
}

export function parseActivationPath(path: string): ParsedPath {
  const parts = path.split('/');
  const last = parts.at(-1) ?? path;
  const loops: LoopFrame[] = [];
  for (const part of parts.slice(0, -1)) {
    const match = FRAME.exec(part);
    const nodeId = match?.[1];
    const iteration = match?.[2];
    if (nodeId !== undefined && iteration !== undefined) {
      loops.push({ nodeId, iteration: Number(iteration) });
    }
  }
  return { nodeId: FRAME.exec(last)?.[1] ?? last, loops };
}

function momentMs(moment: string | null): number | null {
  return moment === null ? null : Date.parse(moment);
}

function errorText(record: RunNodeRecord): string | null {
  const { error } = record;
  return error === null ? null : `${error.class}: ${error.message}`;
}

export function activationOfRecord(record: RunNodeRecord): Activation {
  return {
    path: record.path,
    nodeId: record.node_id,
    loops: parseActivationPath(record.path).loops,
    iteration: record.iteration,
    status: record.status,
    seq: record.seq,
    startMs: momentMs(record.started_at),
    endMs: momentMs(record.finished_at),
    preview: record.output_preview,
    truncated: record.truncated,
    error: errorText(record),
    commandIds: record.command_ids,
  };
}

type Carried = Pick<
  Activation,
  'startMs' | 'endMs' | 'truncated' | 'error' | 'commandIds' | 'preview'
>;

const NOTHING_CARRIED: Carried = {
  startMs: null,
  endMs: null,
  truncated: false,
  error: null,
  commandIds: [],
  preview: null,
};

export function activationOfTrace(
  node: TraceNodeState,
  seq: number,
  previous: Activation | undefined,
): Activation {
  const parsed = parseActivationPath(node.path);
  const carried = previous ?? NOTHING_CARRIED;
  return {
    path: node.path,
    nodeId: parsed.nodeId,
    loops: parsed.loops,
    iteration: node.iteration,
    status: node.status,
    seq,
    startMs: carried.startMs,
    endMs: carried.endMs,
    preview: node.outputPreview ?? carried.preview,
    truncated: carried.truncated,
    error: carried.error,
    commandIds: carried.commandIds,
  };
}

export function mergeActivations(
  stored: readonly Activation[],
  live: readonly Activation[],
): readonly Activation[] {
  if (live.length === 0) return stored;
  const livePaths = new Set(live.map((activation) => activation.path));
  return [...stored.filter((activation) => !livePaths.has(activation.path)), ...live];
}
