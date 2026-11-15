import {
  PLANNER_BEDTIME,
  PLANNER_SLEEP_SOUND_BODY,
  PLANNER_SLEEP_SOUNDS,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { selection, type Selection } from './selected-tool';

export const CLOCK_EDIT_FIELDS = {
  bedtime: PLANNER_BEDTIME,
  sleepSounds: PLANNER_SLEEP_SOUNDS,
  sleepSound: PLANNER_SLEEP_SOUND_BODY,
} as const;

const BEDTIME_SET = z
  .strictObject({
    bedtime: CLOCK_EDIT_FIELDS.bedtime.optional(),
    sleepSounds: CLOCK_EDIT_FIELDS.sleepSounds.optional(),
  })
  .refine((input) => input.bedtime !== undefined || input.sleepSounds !== undefined, {
    message: 'give bedtime, sleepSounds or both',
  });

const STORED_PREFERENCES = z.looseObject({
  bedtime: PLANNER_BEDTIME,
  sleep_sounds: PLANNER_SLEEP_SOUNDS,
});

export function bedtimeSet(): Selection {
  return selection({
    input: BEDTIME_SET,
    run: async (context, input, as) => {
      const stored = STORED_PREFERENCES.parse(
        await operate(context, 'readPlannerPreferences', {}, as),
      );
      const saved = z.object({ bedtime: z.unknown(), sleep_sounds: z.unknown() }).parse(
        await operate(
          context,
          'writePlannerPreferences',
          {
            body: {
              ...stored,
              bedtime: input.bedtime ?? stored.bedtime,
              sleep_sounds: input.sleepSounds ?? stored.sleep_sounds,
            },
          },
          as,
        ),
      );
      return { bedtime: saved.bedtime, sleep_sounds: saved.sleep_sounds };
    },
  });
}

export function sleepSound(): Selection {
  return selection({
    input: z.strictObject({ sleepSound: CLOCK_EDIT_FIELDS.sleepSound }),
    run: (context, input, as) =>
      operate(context, 'playPlannerSleepSound', { body: input.sleepSound }, as),
  });
}
