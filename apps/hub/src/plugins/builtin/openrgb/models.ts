import type { ModelSpec } from '@smarteverything/domain';
import { entryFromSpec, type ModelEntry } from '../../../models/contributions';
import { OPENRGB_BOARD_MODELS, RGB_GPU_MODEL, RGB_MOTHERBOARD_MODEL } from './models-2';
import { RGB_KEYBOARD_MODEL, RGB_MOUSE_MODEL } from './models-input';
import { openRgbMatch, type OpenRgbKind } from './models-kit';
import { RGB_CASE_FAN_MODEL, RGB_RAM_MODEL } from './models-ram-fan';

export { RGB_CASE_FAN_MODEL, RGB_KEYBOARD_MODEL, RGB_MOUSE_MODEL, RGB_RAM_MODEL };

export const OPENRGB_MODELS: readonly ModelSpec[] = [
  RGB_KEYBOARD_MODEL,
  RGB_MOUSE_MODEL,
  RGB_RAM_MODEL,
  RGB_CASE_FAN_MODEL,
  ...OPENRGB_BOARD_MODELS,
];

const KIND_OF: Readonly<Record<string, OpenRgbKind>> = {
  [RGB_KEYBOARD_MODEL.id]: 'keyboard',
  [RGB_MOUSE_MODEL.id]: 'mouse',
  [RGB_RAM_MODEL.id]: 'dram',
  [RGB_CASE_FAN_MODEL.id]: 'cooler',
  [RGB_GPU_MODEL.id]: 'gpu',
  [RGB_MOTHERBOARD_MODEL.id]: 'motherboard',
};

export const OPENRGB_MODEL_ENTRIES: readonly ModelEntry[] = OPENRGB_MODELS.flatMap((spec) => {
  const kind = KIND_OF[spec.id];
  return kind === undefined ? [] : [entryFromSpec(spec, { match: openRgbMatch(kind) })];
});
