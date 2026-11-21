import {
  VACUUM_SLOTS,
  type VacuumClean,
  type VacuumScene,
  type VacuumSlot,
} from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';

export interface VacuumHeld {
  readonly deviceId: string;
  readonly scenes: readonly VacuumScene[];
  readonly cleanIds: readonly string[];
  readonly open: readonly VacuumClean[];
}

export const VACUUM_HELD_UNIT = storeUnit(
  (store, { deviceIds }: { readonly deviceIds: readonly string[] }): VacuumHeld[] =>
    deviceIds.map((deviceId) => {
      const cleans = store.vacuumCleans.list(deviceId);
      return {
        deviceId,
        scenes: VACUUM_SLOTS.flatMap((slot: VacuumSlot) => {
          const scene = store.vacuumScenes.latest(deviceId, slot);
          return scene === undefined ? [] : [scene];
        }),
        cleanIds: cleans.map((clean) => clean.id),
        open: cleans.flatMap((clean) => {
          if (clean.endedAt !== null) return [];
          const held = store.vacuumCleans.get(deviceId, clean.id);
          return held === undefined ? [] : [held];
        }),
      };
    }),
);
