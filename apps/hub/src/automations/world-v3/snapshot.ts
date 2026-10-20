import { capabilityOf, JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { controlKey, controlValue } from './device-reads';
import { parseInputs } from './inputs';
import { ReadFailure, outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { TARGET_VALUE } from './refs';
import { devicesOf } from './targets';
import type { WorldReadDeps } from './deps';

export const SNAPSHOT_VALUE = z.record(z.string(), z.record(z.string(), JSON_VALUE));
export type Snapshot = z.infer<typeof SNAPSHOT_VALUE>;

const SNAPSHOT = z.object({
  target: TARGET_VALUE,
  controls: z.array(z.string().min(1)).min(1),
});

export function snapshotHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'device.snapshot': (inputs): ReadResult => {
      const request = parseInputs('device.snapshot', SNAPSHOT, inputs);
      const keys = request.controls.map(controlKey);
      const taken: Record<string, Record<string, JsonValue>> = {};
      for (const device of devicesOf(deps.store, request.target)) {
        const values = keys.flatMap((key): [string, JsonValue][] => {
          const capability = capabilityOf(device, key);
          if (capability === undefined || capability.access === 'read') return [];
          if (capability.value.kind === 'action') return [];
          const value = controlValue(deps, device, key);
          return value === undefined ? [] : [[key, value]];
        });
        if (values.length > 0) taken[device.id] = Object.fromEntries(values);
      }
      if (Object.keys(taken).length === 0) {
        throw new ReadFailure(
          'NotFound',
          'None of the devices has a control that can be remembered',
        );
      }
      return outputsOf({ snapshot: taken });
    },
  };
}
