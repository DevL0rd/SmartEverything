import { RUN_NODE_RECORD } from '@smarteverything/domain';
import { activationOfRecord } from '../../runs/run-view/run-activation';
import type { Activation, LoopFrame } from '../../runs/run-view/run-activation';
import { idOf } from './graph-scene-fixtures';

export interface RecordSpec {
  readonly seq: number;
  readonly status?: Activation['status'];
  readonly loops?: readonly (readonly [key: string, iteration: number])[];
  readonly error?: string;
}

export function loopFrames(spec: RecordSpec): readonly LoopFrame[] {
  return (spec.loops ?? []).map(([key, iteration]) => ({ nodeId: idOf(key), iteration }));
}

export function record(key: string, spec: RecordSpec): Activation {
  return {
    path: `${key}#${String(spec.seq)}`,
    nodeId: idOf(key),
    loops: loopFrames(spec),
    iteration: 1,
    status: spec.status ?? 'succeeded',
    seq: spec.seq,
    startMs: null,
    endMs: null,
    preview: null,
    truncated: false,
    error: spec.error ?? null,
    commandIds: [],
  };
}

const RUN_ID = '00000000-0000-4000-8000-00000000f001';

const STARTED = '2026-10-19T10:00:00.000Z';

export function runRecord(
  key: string,
  seq: number,
  status: Activation['status'] = 'succeeded',
): Activation {
  return activationOfRecord(
    RUN_NODE_RECORD.parse({
      run_id: RUN_ID,
      seq,
      path: `f${String(seq)}:0`,
      node_id: idOf(key),
      iteration: 0,
      status,
      started_at: STARTED,
      finished_at: status === 'running' || status === 'waiting' ? null : STARTED,
      duration_ms: status === 'running' || status === 'waiting' ? null : 0,
      input_preview: null,
      output_preview: null,
      truncated: false,
      error: null,
      command_ids: [],
      late: false,
    }),
  );
}
