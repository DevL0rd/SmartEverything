import { z } from 'zod';
import { operate } from './acting';
import { READ_FIELDS } from './planner-reads-fields';
import { selection, type Selection } from './selected-tool';

export function bedtime(): Selection {
  return selection({
    input: z.strictObject({}),
    run: async (context, _input, as) => {
      const preferences = z
        .object({ bedtime: z.unknown(), sleep_sounds: z.unknown() })
        .parse(await operate(context, 'readPlannerPreferences', {}, as));
      return { bedtime: preferences.bedtime, sleep_sounds: preferences.sleep_sounds };
    },
  });
}

export function sleep(): Selection {
  return selection({
    input: z.strictObject({ from: READ_FIELDS.from, to: READ_FIELDS.to }),
    run: (context, input, as) =>
      operate(context, 'readPlannerSleep', { query: { from: input.from, to: input.to } }, as),
  });
}
