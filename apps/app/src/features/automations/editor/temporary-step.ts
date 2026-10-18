import type { JsonValue, StepV2 } from '@smarteverything/domain';
import type { Temporary } from './temporary-fields';

type SetStep = Extract<StepV2, { do: 'set' }>;

export function withTemporary(step: SetStep, change: Temporary, fallbackTo: JsonValue): SetStep {
  const { for: _for, while: _while, priority: _priority, ...rest } = step;
  if (change.for === undefined) {
    const { by: _by, to, ...kept } = rest;
    return { ...kept, to: step.by === undefined ? (to ?? fallbackTo) : fallbackTo };
  }
  return {
    ...rest,
    for: change.for,
    ...(change.while === undefined ? {} : { while: change.while }),
    ...(change.priority === undefined ? {} : { priority: change.priority }),
  };
}
