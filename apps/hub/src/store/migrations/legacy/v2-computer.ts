import {
  AUDIO_CHANGE,
  DISPLAY_BRIGHTNESS_CHANGE,
  DISPLAY_MODE_CHANGE,
  DISPLAY_NIGHT_LIGHT_CHANGE,
  DISPLAY_POSITION_CHANGE,
  DISPLAY_SCALE_CHANGE,
  displayChangeKeepable,
} from '@smarteverything/domain';
import { z } from 'zod';

const ID = z.uuid();
const NODE = { id: ID.optional() };

export const COMPUTER_AUDIO_STEP = z.strictObject({
  do: z.literal('audio'),
  ...NODE,
  computer: ID,
  change: AUDIO_CHANGE,
});

const STEP_DISPLAY_CHANGE = z.discriminatedUnion('action', [
  DISPLAY_MODE_CHANGE,
  DISPLAY_SCALE_CHANGE,
  DISPLAY_POSITION_CHANGE,
  DISPLAY_BRIGHTNESS_CHANGE,
  DISPLAY_NIGHT_LIGHT_CHANGE,
]);

export const COMPUTER_DISPLAY_STEP = z
  .strictObject({
    do: z.literal('display'),
    ...NODE,
    computer: ID,
    change: STEP_DISPLAY_CHANGE,
    keep: z.boolean().optional(),
  })
  .refine((step) => step.keep !== true || displayChangeKeepable(step.change), {
    message:
      'keep applies only to mode, scale and position changes; brightness and night light need no keeping',
  });
