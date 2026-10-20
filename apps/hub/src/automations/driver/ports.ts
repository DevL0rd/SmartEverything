import type { FlowError, JsonValue } from '@smarteverything/domain';
import type {
  EffectRequest,
  NodeResult,
  StepContext,
  StepRecord,
} from '@smarteverything/flow/interpret/frames';
import type { WaitResume } from '@smarteverything/flow/interpret/waits';
import type { CancelReason, RunState, Wait } from '@smarteverything/flow/state/run-state';
import type { Cancel, Clock } from '../../clock';
import type { DecisionReason } from './decisions';

export type RunKind = 'live' | 'dry' | 'simulated';

type RunOutcome = 'succeeded' | 'failed' | 'cancelled';

export interface Ending {
  readonly status: RunOutcome;
  readonly reason?: CancelReason | undefined;
  readonly error?: FlowError | undefined;
  readonly outputs?: Readonly<Record<string, JsonValue>> | undefined;
}

export interface RunScope {
  readonly runId: string;
  readonly automationId: string;
  readonly signal: AbortSignal;
}

export interface FinishedRun {
  readonly runId: string;
  readonly automationId: string;
  readonly name: string;
  readonly outcome: RunOutcome;
  readonly durationMs: number;
  readonly error: string | null;
}

export interface RefusedStart {
  readonly automationId: string;
  readonly name: string;
  readonly reason: string;
  readonly message: string;
  readonly startedBy: string | null;
}

type DroppedBecause = DecisionReason | CancelReason;

export interface RunSink {
  readonly queued: (state: RunState, kind: RunKind) => void;
  readonly dropped: (state: RunState, because: DroppedBecause) => void;
  readonly started: (state: RunState, kind: RunKind) => void;
  readonly slice: (runId: string, records: readonly StepRecord[]) => void;
  readonly parked: (state: RunState) => void;
  readonly resumed: (state: RunState, lateMs: number) => void;
  readonly finished: (state: RunState, ending: Ending, kind: RunKind) => void;
}

export interface DriverPorts {
  readonly clock: Clock;
  readonly monotonic: () => number;
  readonly ids: () => string;
  readonly storm: (automationId: string, name: string) => void;
  readonly perform: (request: EffectRequest, scope: RunScope) => Promise<NodeResult>;
  readonly watch: (wait: Wait, resume: (resume: WaitResume) => void, scope: RunScope) => Cancel;
  readonly afterCancel: (request: EffectRequest, result: NodeResult, scope: RunScope) => void;
  readonly refused: (start: RefusedStart) => void;
  readonly recordRun: (finished: FinishedRun) => void;
  readonly sink: RunSink;
}

export interface RunStart {
  readonly state: RunState;
  readonly context: StepContext;
  readonly name: string;
  readonly kind: RunKind;
  readonly startedBy: string | null;
  readonly key?: string | undefined;
}
