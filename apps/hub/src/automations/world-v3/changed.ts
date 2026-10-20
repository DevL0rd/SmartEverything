import { JSON_VALUE, jsonEquals } from '@smarteverything/domain';
import { z } from 'zod';
import { parseInputs } from './inputs';
import { outputsOf, type ReadHandlers, type ReadResult } from './read-port';

const CHANGED = z.object({ value: JSON_VALUE });

const SEEN = z.strictObject({ value: JSON_VALUE });

export function changedHandlers(): ReadHandlers {
  return {
    'logic.changed': (inputs, scope): ReadResult => {
      const { value } = parseInputs('logic.changed', CHANGED, inputs);
      const seen = SEEN.safeParse(scope.memory);
      const result = outputsOf({
        changed: !seen.success || !jsonEquals(seen.data.value, value),
        previous: seen.success ? seen.data.value : undefined,
      });
      return { ...result, memory: { value } };
    },
  };
}
