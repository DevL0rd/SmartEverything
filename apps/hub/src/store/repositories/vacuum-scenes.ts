import {
  VACUUM_SCENE,
  VACUUM_SLOT,
  type VacuumScene,
  type VacuumSlot,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

const STORED_SCENE = z.object({ scene: SQL_JSON.pipe(VACUUM_SCENE) });

const INDEX = z.object({ map_index: z.number().int() });

const PRESENT = z.object({ present: z.number() });

const SAVE = `insert into vacuum_scenes (device_id, slot, map_index, scene, fetched_at)
  values ($deviceId, $slot, $index, $scene, $fetchedAt)
  on conflict (device_id, slot, map_index) do update
  set scene = excluded.scene, fetched_at = excluded.fetched_at`;

export class VacuumScenesRepository {
  constructor(private readonly context: StoreContext) {}

  save(deviceId: string, scene: VacuumScene): void {
    this.context.write(() => {
      this.context.sql.run('save the vacuum map scene', SAVE, {
        deviceId,
        slot: VACUUM_SLOT.parse(scene.slot),
        index: scene.index,
        scene: jsonText(scene),
        fetchedAt: scene.fetchedAt,
      });
    });
  }

  at(deviceId: string, slot: VacuumSlot, index: number): VacuumScene | undefined {
    return this.context.sql.get(
      STORED_SCENE,
      `select scene from vacuum_scenes
       where device_id = $deviceId and slot = $slot and map_index = $index`,
      { deviceId, slot, index },
    )?.scene;
  }

  latest(deviceId: string, slot: VacuumSlot): VacuumScene | undefined {
    return this.context.sql.get(
      STORED_SCENE,
      `select scene from vacuum_scenes
       where device_id = $deviceId and slot = $slot
       order by map_index desc limit 1`,
      { deviceId, slot },
    )?.scene;
  }

  has(deviceId: string, slot: VacuumSlot, index: number): boolean {
    const row = this.context.sql.get(
      PRESENT,
      `select count(*) as present from vacuum_scenes
       where device_id = $deviceId and slot = $slot and map_index = $index`,
      { deviceId, slot, index },
    );
    return row?.present === 1;
  }

  indexes(deviceId: string, slot: VacuumSlot): number[] {
    return this.context.sql
      .all(
        INDEX,
        `select map_index from vacuum_scenes
         where device_id = $deviceId and slot = $slot order by map_index desc`,
        { deviceId, slot },
      )
      .map((row) => row.map_index);
  }
}
