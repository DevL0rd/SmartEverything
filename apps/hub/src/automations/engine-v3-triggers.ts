import { dependencyKeys, readIndex } from '@smarteverything/flow/compile/reads';
import { WEBHOOK_SOURCE } from '@smarteverything/domain';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import type { Cancel } from '../clock';
import { conditionParts } from './engine-v3-admission';
import type { Subject } from './engine-v3-start';
import type { EngineV3Ports, Loaded } from './engine-v3-types';
import { evaluateCondition } from './triggers-v3/admit';
import { armTimedTriggers } from './triggers-v3/armers';
import type { CompiledTriggers } from './triggers-v3/armers';
import { armConditionTriggers } from './triggers-v3/condition-triggers';
import type { ConditionHost } from './triggers-v3/condition-triggers';
import type { TriggerFire } from './triggers-v3/payload';
import type { TriggerProblem } from './triggers-v3/trigger-types';

type TriggerPorts = Pick<EngineV3Ports, 'clock' | 'place' | 'zone' | 'world' | 'watchKeys'>;

interface TriggerOutput {
  readonly fire: (fire: TriggerFire) => void;
  readonly problem: (problem: TriggerProblem) => void;
}

function conditionHost(
  ports: TriggerPorts,
  subject: Pick<Subject, 'id' | 'program' | 'plan'>,
  output: TriggerOutput,
): ConditionHost {
  const index = readIndex(subject.plan);
  return {
    clock: ports.clock,
    keysOf: (condition) => dependencyKeys(index, condition),
    watch: ports.watchKeys,
    evaluate: (entry): Checked<boolean> => {
      const at = ports.clock.now().toISOString();
      const fire: TriggerFire = {
        automationId: entry.automationId,
        triggerId: entry.triggerId,
        key: entry.key,
        kind: entry.kind,
        at,
        payload: { at },
      };
      return evaluateCondition(conditionParts(ports, subject, fire), entry.condition, fire);
    },
    ...output,
  };
}

export function armTriggers(
  ports: TriggerPorts,
  subject: Subject,
  compiled: CompiledTriggers,
  output: TriggerOutput,
): Cancel {
  const cancels = [
    armTimedTriggers(compiled, { clock: ports.clock, place: ports.place, ...output }),
    armConditionTriggers(compiled.conditions, conditionHost(ports, subject, output)),
  ];
  return (): void => {
    for (const cancel of cancels) cancel();
  };
}

export function listensOnWebhook(loaded: Iterable<Loaded>, path: string): boolean {
  return [...loaded].some(({ compiled }) =>
    compiled.signals.some(
      ({ matcher }) => matcher.source === WEBHOOK_SOURCE && matcher.field === path,
    ),
  );
}
