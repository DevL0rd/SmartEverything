import { ApiError } from '@smarteverything/domain';
import type { AutomationRunTrigger, JsonValue, SignalInput } from '@smarteverything/domain';
import type { RunStart } from './driver/ports';
import type { SimStart } from './sim/rig';
import { contextOf, freshState, triggerKeyOf } from './engine-v3-start';
import type { Subject } from './engine-v3-start';
import { calledRun } from './triggers-v3/called';
import { signalPayload, type TriggerFire } from './triggers-v3/payload';
import { walkProgram } from '@smarteverything/flow/program/walk';

export interface Rehearsal {
  readonly start: SimStart;
  readonly nodeIds: ReadonlyMap<string, string>;
}

export interface RehearsalSource {
  readonly given: Readonly<Record<string, JsonValue>>;
  readonly startedBy: string | null;
  readonly zone: () => string;
  readonly trigger?: AutomationRunTrigger | undefined;
}

interface Fired {
  readonly fire: TriggerFire;
  readonly signal: SignalInput | null;
}

function firedBy(subject: Subject, trigger: AutomationRunTrigger, now: Date): Fired {
  const node = subject.program.triggers.find((entry) => entry.key === trigger.key);
  if (node === undefined) {
    const keys = subject.program.triggers.map((entry) => entry.key).join(', ');
    throw new ApiError(
      'invalid_request',
      `There is no trigger "${trigger.key}"; the triggers are ${keys === '' ? 'none' : keys}.`,
    );
  }
  const at = now.toISOString();
  const signal = trigger.signal === undefined ? null : { ...trigger.signal, at };
  const payload = signal === null ? { at } : signalPayload(node.kind, signal);
  const fire = { automationId: subject.id, triggerId: node.id, key: node.key, kind: node.kind, at };
  return { fire: { ...fire, payload }, signal };
}

export function rehearsalOf(subject: Subject, source: RehearsalSource): Rehearsal {
  const { program } = subject;
  const { given, startedBy, zone, trigger } = source;
  return {
    nodeIds: new Map(walkProgram(program).map(({ node }) => [node.key, node.id])),
    start: {
      build: (runId, env, call): RunStart => {
        const called = calledRun({
          automationId: subject.id,
          nodes: program.triggers,
          declared: program.inputs,
          given: call?.inputs ?? given,
          at: env.clock.now(),
        });
        if (!called.ok) throw new ApiError('invalid_request', called.message);
        const fired =
          trigger === undefined || call !== null
            ? { fire: called.value.fire, signal: null }
            : firedBy(subject, trigger, env.clock.now());
        const state = freshState(
          subject,
          {
            ...fired,
            inputs: called.value.inputs,
            causeChain: call?.causeChain ?? [],
            manual: true,
            startedBy,
            parentRunId: call?.parentRunId ?? null,
          },
          runId,
          env.clock.now().getTime(),
        );
        return {
          state,
          context: contextOf(subject, triggerKeyOf(state), {
            reads: env.reads,
            persistent: env.world.persistentVariables(),
            stateMemory: env.world.stateMemory(),
            clock: env.clock,
            zone: () => env.zone ?? zone(),
          }),
          name: subject.name,
          kind: 'dry',
          startedBy,
        };
      },
    },
  };
}
