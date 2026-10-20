import { JSON_VALUE, SIGNAL_INPUT, appendTo } from '@smarteverything/domain';
import type {
  AutomationRunRecord,
  JsonValue,
  RunNodeRecord,
  SignalInput,
} from '@smarteverything/domain';
import type { NodeResult, ReadPort, ReadRequest } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';

export interface StoredRun {
  readonly record: Pick<AutomationRunRecord, 'trigger' | 'state'>;
  readonly nodes: readonly RunNodeRecord[];
}

export interface ReplaySeed {
  readonly trigger: SignalInput | null;
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly captured: ReadCapture;
  readonly truncated: readonly string[];
}

export interface NodeState {
  readonly nodeId: string;
  readonly iteration: number;
  readonly status: RunNodeRecord['status'];
}

const STORED_INPUTS = z.object({ inputs: z.record(z.string(), JSON_VALUE) });

function resultOf(node: RunNodeRecord): NodeResult | undefined {
  if (node.status === 'failed' && node.error !== null) {
    return { ok: false, class: node.error.class, message: node.error.message };
  }
  if (node.status !== 'succeeded' || node.output_preview === null || node.truncated) {
    return undefined;
  }
  return { ok: true, value: node.output_preview };
}

export class ReadCapture {
  private readonly queues = new Map<string, NodeResult[]>();

  constructor(nodes: readonly RunNodeRecord[]) {
    const ordered = [...nodes].sort((first, second) => first.seq - second.seq);
    for (const node of ordered) {
      const result = resultOf(node);
      if (result === undefined) continue;
      appendTo(this.queues, node.node_id, result);
    }
  }

  take(nodeId: string): NodeResult | undefined {
    return this.queues.get(nodeId)?.shift();
  }
}

export function replaySeed(run: StoredRun): ReplaySeed {
  const trigger = SIGNAL_INPUT.safeParse(run.record.trigger);
  const inputs = STORED_INPUTS.safeParse(run.record.state);
  return {
    trigger: trigger.success ? trigger.data : null,
    inputs: inputs.success ? inputs.data.inputs : {},
    captured: new ReadCapture(run.nodes),
    truncated: [...new Set(run.nodes.filter((node) => node.truncated).map((node) => node.node_id))],
  };
}

export interface ReplayReads {
  readonly port: ReadPort;
  readonly flagged: readonly string[];
}

export function replayReads(inner: ReadPort, captured: ReadCapture): ReplayReads {
  const flagged: string[] = [];
  const port: ReadPort = {
    node: (request: ReadRequest) => {
      const stored = captured.take(request.node.id);
      if (stored !== undefined) return stored;
      if (!flagged.includes(request.node.id)) flagged.push(request.node.id);
      return inner.node(request);
    },
    variable: (name, kept) => inner.variable(name, kept),
  };
  return { port, flagged };
}

export function instantsOf(nodes: readonly RunNodeRecord[]): readonly string[] {
  const moments = nodes.flatMap((node) => [node.started_at, node.finished_at]);
  const present = moments.filter((moment): moment is string => moment !== null);
  return [...new Set(present)].sort((first, second) => Date.parse(first) - Date.parse(second));
}

function openedAt(node: RunNodeRecord): number | undefined {
  const moment = node.started_at ?? node.finished_at;
  return moment === null ? undefined : Date.parse(moment);
}

function stateAt(node: RunNodeRecord, instant: number): NodeState {
  const closed = node.finished_at !== null && Date.parse(node.finished_at) <= instant;
  return {
    nodeId: node.node_id,
    iteration: node.iteration,
    status: closed ? node.status : 'running',
  };
}

export function statesAt(
  nodes: readonly RunNodeRecord[],
  moment: string,
): ReadonlyMap<string, NodeState> {
  const instant = Date.parse(moment);
  const states = new Map<string, NodeState>();
  const ordered = [...nodes].sort((first, second) => first.seq - second.seq);
  for (const node of ordered) {
    const opened = openedAt(node);
    if (opened !== undefined && opened <= instant) states.set(node.path, stateAt(node, instant));
  }
  return states;
}
