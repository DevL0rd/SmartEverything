import { z } from 'zod';
import type { PluginRecords } from '../contract';
import { jsonOf } from '../json-value';
import type { Look } from './colour-math';
import type { LookMemory } from './controller-model';

const STORED_LOOK = z.object({
  hue: z.number(),
  saturation: z.number(),
  brightness: z.number(),
});

export function recordLookMemory(records: PluginRecords): LookMemory {
  return {
    get: (unitId): Look | null => {
      const stored = STORED_LOOK.safeParse(records.get(unitId));
      return stored.success ? stored.data : null;
    },
    put: (unitId, look): void => {
      records.put(unitId, jsonOf(look));
    },
  };
}
