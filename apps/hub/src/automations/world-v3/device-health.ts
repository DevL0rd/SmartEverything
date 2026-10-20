import { presentDevice, withRole } from '@smarteverything/domain';
import { z } from 'zod';
import { parseInputs } from './inputs';
import { outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { DEVICE_REF } from './refs';
import { deviceById } from './targets';
import type { WorldReadDeps } from './deps';

const DEVICE_HEALTH = z.object({ device: DEVICE_REF });

export function deviceHealthHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'device.health': (inputs): ReadResult => {
      const { device: id } = parseInputs('device.health', DEVICE_HEALTH, inputs);
      const device = deviceById(deps.store, id);
      const battery = withRole(presentDevice(device), 'battery');
      const level = battery === undefined ? undefined : deps.observed(device.id, battery.key);
      const observations = deps.store.state.ofDevice(device.id).map((row) => row.observed_at);
      const lastSeen = observations.length === 0 ? undefined : observations.sort().at(-1);
      return outputsOf({
        online: device.online,
        battery: typeof level === 'number' ? level : undefined,
        lastSeen,
        provider: device.provider,
      });
    },
  };
}
