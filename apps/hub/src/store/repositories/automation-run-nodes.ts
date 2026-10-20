import { z } from 'zod';
import {
  FLOW_ERROR,
  RUN_NODE_RECORD,
  holdsSecret,
  type FlowError,
  type FlowType,
  type RunNodeRecord,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { moment, type StoreContext } from '../context';
import { jsonText } from '../sql';

export const PREVIEW_BYTES = 2048;
const KEPT_LOOP_EDGE = 20;
const AGGREGATE_ITERATION = '[*]';

const STORED_NODE = storedRow(RUN_NODE_RECORD, {
  flags: ['truncated', 'late'],
  json: ['input_preview', 'output_preview', 'error', 'command_ids'],
});
const COLUMNS = Object.keys(RUN_NODE_RECORD.shape).join(',');
const OPEN_ROW = z.strictObject({ seq: z.int(), path: z.string(), node_id: z.string() });
const LOOP_SEGMENT = /^\[(\d+)\](.*)$/;
const LOOP_ROW = z.strictObject({
  seq: z.int(),
  path: z.string(),
  status: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  duration_ms: z.int().nullable(),
});

export interface RunNodeEnding {
  readonly message: string;
  readonly finishedAt: string;
}

export interface PortPreviewInput {
  readonly value: unknown;
  readonly type: FlowType;
}

export type PortPreviews = Readonly<Record<string, PortPreviewInput>>;

export interface PreviewResult {
  readonly preview: Record<string, unknown>;
  readonly truncated: boolean;
}

export interface RunNodeActivation {
  readonly path: string;
  readonly nodeId: string;
  readonly iteration: number;
  readonly status: RunNodeRecord['status'];
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly input: PortPreviews | null;
  readonly output: PortPreviews | null;
  readonly error: FlowError | null;
  readonly commandIds: readonly string[];
  readonly late: boolean;
}

export function cancellationError(ending: RunNodeEnding, nodeId: string, path: string): FlowError {
  return FLOW_ERROR.parse({
    class: 'Cancelled',
    message: ending.message,
    node: nodeId,
    path,
    attempt: 1,
    at: ending.finishedAt,
  });
}

export interface RunNodeSettlement {
  readonly status: Exclude<RunNodeRecord['status'], 'running' | 'waiting'>;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly output?: PortPreviews | null;
  readonly error?: FlowError | null;
  readonly commandIds?: readonly string[];
}

function optionalPreview(ports: PortPreviews | null): { text: string | null; truncated: boolean } {
  if (ports === null) return { text: null, truncated: false };
  const { preview, truncated } = previewOfPorts(ports);
  return { text: jsonText(preview), truncated };
}

function optionalMoment(value: string | null): string | null {
  return value === null ? null : moment(value);
}

function nodeOfSegment(segment: string): string {
  const bracket = segment.indexOf('[');
  return segment.slice(segment.indexOf('#') + 1, bracket === -1 ? undefined : bracket);
}

function cutToBytes(text: string, bytes: number): string {
  const cut = Buffer.from(text, 'utf8').subarray(0, bytes).toString('utf8');
  return cut.endsWith('�') ? cut.slice(0, -1) : cut;
}

export function portPreview(port: PortPreviewInput): { value: unknown; truncated: boolean } {
  if (holdsSecret(port.type)) return { value: { $redacted: true }, truncated: false };
  const text = port.value === undefined ? 'null' : JSON.stringify(port.value);
  if (Buffer.byteLength(text, 'utf8') <= PREVIEW_BYTES)
    return { value: JSON.parse(text), truncated: false };
  return { value: { $truncated: cutToBytes(text, PREVIEW_BYTES) }, truncated: true };
}

export function previewOfPorts(ports: PortPreviews): PreviewResult {
  const preview: Record<string, unknown> = {};
  let truncated = false;
  for (const [name, port] of Object.entries(ports)) {
    const one = portPreview(port);
    preview[name] = one.value;
    truncated ||= one.truncated;
  }
  return { preview, truncated };
}

interface Aggregate {
  count: number;
  succeeded: number;
  failed: number;
  other: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  firstIteration: number;
  lastIteration: number;
  startedAt: string | null;
  finishedAt: string | null;
}

function emptyAggregate(iteration: number): Aggregate {
  return {
    count: 0,
    succeeded: 0,
    failed: 0,
    other: 0,
    totalMs: 0,
    minMs: Number.POSITIVE_INFINITY,
    maxMs: 0,
    firstIteration: iteration,
    lastIteration: iteration,
    startedAt: null,
    finishedAt: null,
  };
}

function earliest(a: string | null, b: string | null): string | null {
  return a === null || (b !== null && b < a) ? b : a;
}

function latest(a: string | null, b: string | null): string | null {
  return a === null || (b !== null && b > a) ? b : a;
}

function folded(aggregate: Aggregate, row: z.infer<typeof LOOP_ROW>, iteration: number): Aggregate {
  const durationMs = row.duration_ms ?? 0;
  return {
    count: aggregate.count + 1,
    succeeded: aggregate.succeeded + (row.status === 'succeeded' ? 1 : 0),
    failed: aggregate.failed + (row.status === 'failed' ? 1 : 0),
    other: aggregate.other + (row.status === 'succeeded' || row.status === 'failed' ? 0 : 1),
    totalMs: aggregate.totalMs + durationMs,
    minMs: Math.min(aggregate.minMs, durationMs),
    maxMs: Math.max(aggregate.maxMs, durationMs),
    firstIteration: Math.min(aggregate.firstIteration, iteration),
    lastIteration: Math.max(aggregate.lastIteration, iteration),
    startedAt: earliest(aggregate.startedAt, row.started_at),
    finishedAt: latest(aggregate.finishedAt, row.finished_at),
  };
}

interface LoopRow {
  readonly row: z.infer<typeof LOOP_ROW>;
  readonly iteration: number;
  readonly rest: string;
}

function summarisedLoop(
  rows: readonly LoopRow[],
  edge: number,
): { readonly forgotten: readonly number[]; readonly aggregates: ReadonlyMap<string, Aggregate> } {
  const lastIteration = Math.max(-1, ...rows.map((entry) => entry.iteration));
  const forgotten: number[] = [];
  const aggregates = new Map<string, Aggregate>();
  for (const entry of rows) {
    if (entry.iteration < edge || entry.iteration > lastIteration - edge) continue;
    forgotten.push(entry.row.seq);
    const aggregate = aggregates.get(entry.rest) ?? emptyAggregate(entry.iteration);
    aggregates.set(entry.rest, folded(aggregate, entry.row, entry.iteration));
  }
  return { forgotten, aggregates };
}

export class AutomationRunNodesRepository {
  constructor(private readonly context: StoreContext) {}

  forRun(runId: string, afterSeq = -1, limit = 500): RunNodeRecord[] {
    return this.context.sql.all(
      STORED_NODE,
      `select ${COLUMNS} from automation_run_nodes where run_id=$runId and seq > $afterSeq order by seq limit $limit`,
      { runId, afterSeq, limit },
    );
  }

  ofNode(runId: string, nodeId: string): RunNodeRecord[] {
    return this.context.sql.all(
      STORED_NODE,
      `select ${COLUMNS} from automation_run_nodes where run_id=$runId and node_id=$nodeId order by seq`,
      { runId, nodeId },
    );
  }

  bytesOfRun(runId: string): number {
    return (
      this.context.sql.get(
        z.strictObject({ bytes: z.int() }),
        `select coalesce(sum(length(cast(path as blob)) + length(cast(node_id as blob)) + coalesce(length(cast(input_preview as blob)),0) + coalesce(length(cast(output_preview as blob)),0) + coalesce(length(cast(error as blob)),0) + length(cast(command_ids as blob))),0) as bytes from automation_run_nodes where run_id=$runId`,
        { runId },
      )?.bytes ?? 0
    );
  }

  append(runId: string, activations: readonly RunNodeActivation[]): RunNodeRecord[] {
    if (activations.length === 0) return [];
    return this.context.write(() => {
      const first = this.nextSeq(runId);
      activations.forEach((activation, index) => {
        this.insert(runId, first + index, activation);
      });
      return this.forRun(runId, first - 1, activations.length);
    });
  }

  settle(runId: string, path: string, settlement: RunNodeSettlement): boolean {
    return this.context.write(() => {
      const output =
        settlement.output === undefined || settlement.output === null
          ? null
          : previewOfPorts(settlement.output);
      return (
        this.context.sql.run(
          'settle automation run node record',
          `update automation_run_nodes set status=$status, finished_at=$finishedAt, duration_ms=$durationMs,
             output_preview=coalesce($output, output_preview), truncated=max(truncated, $truncated),
             error=coalesce($error, error), command_ids=coalesce($commandIds, command_ids)
           where run_id=$runId and path=$path and status in ('running','waiting')
             and seq = (select max(seq) from automation_run_nodes where run_id=$runId and path=$path and status in ('running','waiting'))`,
          {
            runId,
            path,
            status: settlement.status,
            finishedAt: moment(settlement.finishedAt),
            durationMs: settlement.durationMs,
            output: output === null ? null : jsonText(output.preview),
            truncated: output?.truncated === true ? 1 : 0,
            error:
              settlement.error === undefined ? null : jsonText(FLOW_ERROR.parse(settlement.error)),
            commandIds:
              settlement.commandIds === undefined ? null : jsonText(settlement.commandIds),
          },
        ) > 0
      );
    });
  }

  closeOpen(runId: string, ending: RunNodeEnding): number {
    return this.context.write(() => {
      const open = this.context.sql.all(
        OPEN_ROW,
        `select seq, path, node_id from automation_run_nodes where run_id=$runId and status in ('running','waiting') order by seq`,
        { runId },
      );
      for (const row of open) {
        const error = cancellationError(ending, row.node_id, row.path);
        this.context.sql.run(
          'close open automation run node record',
          `update automation_run_nodes set status='cancelled', finished_at=$finishedAt, duration_ms=0, error=$error
           where run_id=$runId and seq=$seq`,
          {
            runId,
            seq: row.seq,
            finishedAt: moment(ending.finishedAt),
            error: jsonText(error),
          },
        );
      }
      return open.length;
    });
  }

  finishLoop(runId: string, loopPath: string, edge = KEPT_LOOP_EDGE): number {
    return this.context.write(() => {
      const rows = this.loopRows(runId, loopPath);
      const { forgotten, aggregates } = summarisedLoop(rows, edge);
      if (forgotten.length === 0) return 0;
      this.context.sql.run(
        'forget the middle iterations of a loop',
        'delete from automation_run_nodes where run_id=$runId and seq in (select value from json_each($seqs))',
        { runId, seqs: jsonText(forgotten) },
      );
      let seq = this.nextSeq(runId);
      for (const [rest, aggregate] of aggregates)
        this.insertAggregate(runId, seq++, `${loopPath}${AGGREGATE_ITERATION}${rest}`, aggregate);
      return forgotten.length;
    });
  }

  private loopRows(runId: string, loopPath: string): LoopRow[] {
    const rows = this.context.sql.all(
      LOOP_ROW,
      `select seq,path,status,started_at,finished_at,duration_ms from automation_run_nodes
       where run_id=$runId and substr(path,1,$length)=$loopPath order by seq`,
      { runId, loopPath, length: loopPath.length },
    );
    return rows.flatMap((row) => {
      const match = LOOP_SEGMENT.exec(row.path.slice(loopPath.length));
      return match === null ? [] : [{ row, iteration: Number(match[1]), rest: match[2] ?? '' }];
    });
  }

  private nextSeq(runId: string): number {
    const row = this.context.sql.get(
      z.strictObject({ next: z.int() }),
      'select coalesce(max(seq), -1) + 1 as next from automation_run_nodes where run_id=$runId',
      { runId },
    );
    return row?.next ?? 0;
  }

  private insert(runId: string, seq: number, activation: RunNodeActivation): void {
    const input = optionalPreview(activation.input);
    const output = optionalPreview(activation.output);
    this.context.sql.run(
      'record automation run node',
      `insert into automation_run_nodes(run_id,seq,path,node_id,iteration,status,started_at,finished_at,duration_ms,input_preview,output_preview,truncated,error,command_ids,late)
       values($runId,$seq,$path,$nodeId,$iteration,$status,$startedAt,$finishedAt,$durationMs,$input,$output,$truncated,$error,$commandIds,$late)`,
      {
        runId,
        seq,
        path: activation.path,
        nodeId: activation.nodeId,
        iteration: activation.iteration,
        status: activation.status,
        startedAt: optionalMoment(activation.startedAt),
        finishedAt: optionalMoment(activation.finishedAt),
        durationMs: activation.durationMs,
        input: input.text,
        output: output.text,
        truncated: input.truncated || output.truncated ? 1 : 0,
        error: activation.error === null ? null : jsonText(FLOW_ERROR.parse(activation.error)),
        commandIds: jsonText(activation.commandIds),
        late: activation.late ? 1 : 0,
      },
    );
  }

  private insertAggregate(runId: string, seq: number, path: string, aggregate: Aggregate): void {
    const nodeId = nodeOfSegment(path.slice(path.lastIndexOf('/') + 1));
    this.context.sql.run(
      'record automation loop aggregate',
      `insert into automation_run_nodes(run_id,seq,path,node_id,iteration,status,started_at,finished_at,duration_ms,output_preview,truncated,command_ids,late)
       values($runId,$seq,$path,$nodeId,$iteration,$status,$startedAt,$finishedAt,$durationMs,$output,0,'[]',0)`,
      {
        runId,
        seq,
        path,
        nodeId,
        iteration: aggregate.firstIteration,
        status: aggregate.failed > 0 ? 'failed' : 'succeeded',
        startedAt: aggregate.startedAt,
        finishedAt: aggregate.finishedAt,
        durationMs: aggregate.totalMs,
        output: jsonText({
          aggregate: {
            count: aggregate.count,
            succeeded: aggregate.succeeded,
            failed: aggregate.failed,
            other: aggregate.other,
            totalMs: aggregate.totalMs,
            minMs: aggregate.minMs,
            maxMs: aggregate.maxMs,
            firstIteration: aggregate.firstIteration,
            lastIteration: aggregate.lastIteration,
          },
        }),
      },
    );
  }
}
