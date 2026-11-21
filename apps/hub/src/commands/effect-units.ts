import type { DeviceEffectTarget } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';

export const INTERRUPT_DEVICE_EFFECT_UNIT = storeUnit(
  (store, target: Pick<DeviceEffectTarget, 'device_id' | 'capability'>): void => {
    for (const command of store.commands.open())
      if (
        command.device_id === target.device_id &&
        command.capability === target.capability &&
        command.source === 'automation' &&
        command.requested_by === null
      )
        store.commands.finish(command.id, {
          status: 'failed',
          error: 'The hub stopped before this temporary change finished. It was not replayed.',
        });
    store.deviceEffects.clear(target.device_id, target.capability);
  },
);
