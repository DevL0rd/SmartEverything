import { z } from 'zod';
import { RUN_NODE_STATUS, RUN_RECORD_STATUS } from '../automation-v3';
import { COUNT, ID, JSON_OBJECT, MOMENT } from './primitives';

export const TRACE_TOPIC = 'trace';

export const TRACE_SUBJECT_KINDS = ['automation', 'run'] as const;

export type TraceSubjectKind = (typeof TRACE_SUBJECT_KINDS)[number];

export interface TraceSubject {
  readonly kind: TraceSubjectKind;
  readonly id: string;
}

export function traceSubject(kind: TraceSubjectKind, id: string): string {
  return `${kind}:${id}`;
}

export function traceSubjectOf(subject: string): TraceSubject | null {
  const colon = subject.indexOf(':');
  const kind = TRACE_SUBJECT_KINDS.find((known) => known === subject.slice(0, colon));
  return kind === undefined || colon === -1 ? null : { kind, id: subject.slice(colon + 1) };
}

export const AUTOMATION_WATCH_DEMAND = z.union([
  z.strictObject({ automationId: ID }),
  z.strictObject({ runId: ID }),
]);

export type AutomationWatchDemand = z.infer<typeof AUTOMATION_WATCH_DEMAND>;

export const AUTOMATION_WATCH_MESSAGE = z.strictObject({
  type: z.literal('watch_automations'),
  demands: z.array(AUTOMATION_WATCH_DEMAND),
});

export type AutomationWatchMessage = z.infer<typeof AUTOMATION_WATCH_MESSAGE>;

export function demandSubject(demand: AutomationWatchDemand): string {
  return 'automationId' in demand
    ? traceSubject('automation', demand.automationId)
    : traceSubject('run', demand.runId);
}

export const TRACE_WAIT = z.strictObject({
  kind: z.string().min(1),
  wakeAt: MOMENT.nullable(),
});

export type TraceWait = z.infer<typeof TRACE_WAIT>;

export const TRACE_NODE_STATE = z.strictObject({
  path: z.string().min(1),
  status: RUN_NODE_STATUS,
  iteration: COUNT,
  durationMs: COUNT.nullable(),
  outputPreview: JSON_OBJECT.optional(),
});

export type TraceNodeState = z.infer<typeof TRACE_NODE_STATE>;

export const TRACE_RUN = z.strictObject({
  runId: ID,
  automationId: ID,
  status: RUN_RECORD_STATUS,
  activePaths: z.array(z.string()),
  lastNodeStates: z.array(TRACE_NODE_STATE),
  wait: TRACE_WAIT.nullable(),
});

export type TraceRun = z.infer<typeof TRACE_RUN>;

export const TRACE_KEYFRAME_NOTICE = z.strictObject({
  type: z.literal('trace_keyframe'),
  automationId: ID,
  at: MOMENT,
  runs: z.array(TRACE_RUN),
});

export const TRACE_NODE_STATE_NOTICE = z.strictObject({
  type: z.literal('trace_node_state'),
  automationId: ID,
  runId: ID,
  ...TRACE_NODE_STATE.shape,
});

export const TRACE_RUN_PARKED_NOTICE = z.strictObject({
  type: z.literal('trace_run_parked'),
  automationId: ID,
  runId: ID,
  ...TRACE_WAIT.shape,
});

export const TRACE_RUN_OUTCOMES = ['succeeded', 'failed', 'cancelled'] as const;

export const TRACE_RUN_FINISHED_NOTICE = z.strictObject({
  type: z.literal('trace_run_finished'),
  automationId: ID,
  runId: ID,
  outcome: z.enum(TRACE_RUN_OUTCOMES),
});

export const AUTOMATION_TRACE_NOTICE = z.discriminatedUnion('type', [
  TRACE_KEYFRAME_NOTICE,
  TRACE_NODE_STATE_NOTICE,
  TRACE_RUN_PARKED_NOTICE,
  TRACE_RUN_FINISHED_NOTICE,
]);

export type TraceKeyframeNotice = z.infer<typeof TRACE_KEYFRAME_NOTICE>;
export type TraceNodeStateNotice = z.infer<typeof TRACE_NODE_STATE_NOTICE>;
export type TraceRunParkedNotice = z.infer<typeof TRACE_RUN_PARKED_NOTICE>;
export type TraceRunFinishedNotice = z.infer<typeof TRACE_RUN_FINISHED_NOTICE>;
export type AutomationTraceNotice = z.infer<typeof AUTOMATION_TRACE_NOTICE>;
