import { JSON_VALUE } from '@smarteverything/domain';
import type {
  AutomationRowV3,
  AutomationV3,
  JsonValue,
  Place,
  SignalInput,
  TriggerNode,
} from '@smarteverything/domain';
import type { Plan } from '@smarteverything/flow/compile/plan';
import type { FunctionInterface } from '@smarteverything/flow/functions/interface-hash';
import { rootFrame } from '@smarteverything/flow/interpret/frames';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import { walkProgram } from '@smarteverything/flow/program/walk';
import { resolveBudgets, startBudgets } from '@smarteverything/flow/state/budgets';
import type { PlanRef, RunState } from '@smarteverything/flow/state/run-state';
import { z } from 'zod';
import type { CauseLink } from './driver/admission';
import type { RunStart } from './driver/ports';
import { stepContext } from './engine-v3-context';
import type { ContextPorts } from './engine-v3-context';
import { triggerPayload, type TriggerFire } from './triggers-v3/payload';

export interface CalleeLookup {
  readonly plan: (hash: string) => Plan;
  readonly interface: (ref: PlanRef) => Checked<FunctionInterface>;
}

export interface Subject {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly row: AutomationRowV3;
  readonly program: AutomationV3;
  readonly hash: string;
  readonly plan: Plan;
  readonly callees: readonly PlanRef[];
  readonly lookup: CalleeLookup;
}

export interface StartRequest {
  readonly fire: TriggerFire;
  readonly signal: SignalInput | null;
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly causeChain: readonly CauseLink[];
  readonly manual: boolean;
  readonly startedBy: string | null;
  readonly parentRunId: string | null;
}

const JSON_RECORD = z.record(z.string(), JSON_VALUE);

export function triggerSignal(fire: TriggerFire, signal: SignalInput | null): SignalInput {
  return (
    signal ?? {
      source: 'automation',
      kind: fire.kind,
      subject: null,
      field: null,
      value: null,
      previous: null,
      at: fire.at,
      profileId: null,
      data: fire.payload,
    }
  );
}

export function jsonRecord(value: unknown): Readonly<Record<string, JsonValue>> {
  return JSON_RECORD.parse(JSON.parse(JSON.stringify(value)));
}

function seedOf(runId: string): number {
  return Number.parseInt(runId.replaceAll('-', '').slice(0, 8), 16);
}

export function contextOf(
  subject: Pick<Subject, 'id' | 'program' | 'plan' | 'lookup'>,
  triggerKey: string | null,
  ports: ContextPorts,
): RunStart['context'] {
  return stepContext(
    {
      automationId: subject.id,
      plan: subject.plan,
      lookup: subject.lookup,
      budgets: subject.program.budgets,
      triggerKey,
    },
    ports,
  );
}

export function freshState(
  subject: Subject,
  request: StartRequest,
  runId: string,
  now: number,
): RunState {
  return {
    runId,
    automationId: subject.id,
    revision: subject.revision,
    planRefs: [
      { id: subject.id, revision: subject.revision, hash: subject.hash },
      ...subject.callees,
    ],
    trigger: triggerSignal(request.fire, request.signal),
    payload: triggerPayload(request.fire),
    inputs: request.inputs,
    ownerProfileId: null,
    origin: subject.row.origin,
    causeChain: request.causeChain.map((link) => ({ ...link })),
    frames: [rootFrame()],
    captures: {},
    budgets: startBudgets(resolveBudgets(subject.program.budgets), now),
    seed: seedOf(runId),
  };
}

export function triggerNode(program: AutomationV3, triggerId: string): TriggerNode | undefined {
  return program.triggers.find((node) => node.id === triggerId);
}

export function ignoresOwn(node: TriggerNode | undefined): boolean {
  const port = node?.ports['ignoreOwnChanges'];
  return port === undefined || !('lit' in port) || port.lit !== false;
}

export function triggerKeyOf(state: Pick<RunState, 'payload'>): string | null {
  const { key } = state.payload;
  return typeof key === 'string' ? key : null;
}

export function nodeKeys(program: AutomationV3): ReadonlyMap<string, string> {
  return new Map(walkProgram(program).map(({ node }) => [node.key, node.id]));
}

export function signatureOf(row: AutomationRowV3, place: Place | null): string {
  return `${String(row.revision)}|${row.name}|${JSON.stringify(place)}`;
}

export function restartedSubject(
  row: AutomationRowV3,
  state: Pick<RunState, 'revision' | 'planRefs'>,
  hash: string,
  stored: Pick<Subject, 'plan' | 'lookup'>,
): Subject {
  return {
    id: row.id,
    name: row.name,
    revision: state.revision,
    row,
    program: row.definition,
    hash,
    plan: stored.plan,
    callees: state.planRefs.slice(1),
    lookup: stored.lookup,
  };
}
