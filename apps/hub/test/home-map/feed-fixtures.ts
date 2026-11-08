import { DatabaseSync } from 'node:sqlite';
import {
  VACUUM_MAP_KEY,
  VACUUM_SAVED_MAPS_KEY,
  vacuumSavedMapVersion,
  vacuumSceneVersion,
  type HomeMapOp,
  type JsonValue,
  type VacuumScene,
} from '@smarteverything/domain';
import { HomeMapService } from '../../src/home-map/service';
import { XiaomiVacuumSource } from '../../src/home-map/sources/xiaomi-vacuum';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { HomeMapsRepository } from '../../src/store/repositories/home-maps';
import { Sql } from '../../src/store/sql';
import { vacuumPropertyKey } from '../../src/vacuum/capabilities';
import { testLogger } from '../support/logs';
import { NOW } from './import-fixtures';
import { rectRing, syntheticScene } from './scene-fixtures';

export const CLEANING = 4;
export const CHARGING = 2;

const STATUS = vacuumPropertyKey('status');

export interface MapHarness {
  readonly repo: HomeMapsRepository;
  readonly context: StoreContext;
  readonly service: HomeMapService;
}

export function mapHarness(): MapHarness {
  const sql = new Sql(new DatabaseSync(':memory:', { enableForeignKeyConstraints: true }));
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  const repo = new HomeMapsRepository(context, () => undefined);
  const service = new HomeMapService({
    maps: repo,
    knownModel: (): boolean => true,
    log: testLogger('home-map'),
  });
  return { repo, context, service };
}

export const floorOp = (id: string, name: string): HomeMapOp => ({
  op: 'addFloor',
  floor: {
    id,
    name,
    level: 0,
    elevation: 0,
    ceilingHeight: 2.6,
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    placements: [],
    annotations: [],
  },
});

export const downstairs: VacuumScene = {
  ...syntheticScene,
  robotMapId: 1,
  robotMapName: 'Downstairs',
  isCurrent: true,
};

const upstairsRoom = (
  id: number,
  name: string,
  ring: VacuumScene['carpets'][number]['ring'],
): VacuumScene['rooms'][number] => ({
  id,
  name,
  colour: 1,
  floor: 4010,
  hidden: false,
  areaM2: 1,
  label: { x: (ring[0]?.x ?? 0) + 0.5, y: (ring[0]?.y ?? 0) + 0.5 },
  rings: [ring],
  settings: null,
});

export const upstairs: VacuumScene = {
  ...syntheticScene,
  slot: 'saved',
  index: 9,
  name: 'Upstairs',
  robotMapId: 2,
  robotMapName: 'Upstairs',
  isCurrent: false,
  bounds: { minX: 0, minY: 0, maxX: 7.1, maxY: 4 },
  rooms: [
    upstairsRoom(11, 'Bedroom', rectRing(0, 0, 5, 4)),
    upstairsRoom(12, 'Bath', rectRing(5.1, 0, 7.1, 4)),
  ],
  walls: [{ from: { x: 5.05, y: 0 }, to: { x: 5.05, y: 4 }, kind: 'interior', height: null }],
  doors: [],
  carpets: [],
  furniture: [],
  dock: null,
};

export const widened = (scene: VacuumScene, index: number): VacuumScene => ({
  ...scene,
  index,
  rooms: scene.rooms.map((room, at) =>
    at === 0
      ? { ...room, rings: room.rings.map((ring) => ring.map((p) => ({ x: p.x, y: p.y * 1.1 }))) }
      : room,
  ),
});

export const jittered = (scene: VacuumScene, index: number): VacuumScene => ({
  ...scene,
  index,
  rooms: scene.rooms.map((room) => ({
    ...room,
    rings: room.rings.map((ring) => ring.map((p) => ({ x: p.x + 0.004, y: p.y - 0.003 }))),
  })),
});

export class FakeRobot {
  readonly source: XiaomiVacuumSource;
  private readonly values = new Map<string, JsonValue>();
  private current: VacuumScene | undefined;
  private readonly saved = new Map<number, VacuumScene>();

  constructor(readonly deviceId: string) {
    this.source = new XiaomiVacuumSource({
      scene: (): VacuumScene | undefined => this.current,
      robotMap: (_deviceId, robotMapId): VacuumScene | undefined => this.saved.get(robotMapId),
      value: (_deviceId, key): JsonValue | undefined => this.values.get(key),
      log: testLogger('home-map-source'),
    });
  }

  status(status: number): void {
    this.values.set(STATUS, status);
  }

  publishCurrent(scene: VacuumScene): void {
    this.current = scene;
    this.values.set(VACUUM_MAP_KEY, vacuumSceneVersion(scene));
    this.source.published(this.deviceId, scene);
  }

  list(...entries: { scene: VacuumScene; isCurrent: boolean }[]): void {
    for (const { scene } of entries) {
      if (scene.robotMapId !== undefined) this.saved.set(scene.robotMapId, scene);
    }
    this.values.set(
      VACUUM_SAVED_MAPS_KEY,
      JSON.stringify(
        entries.map(({ scene, isCurrent }) => ({
          robotMapId: scene.robotMapId ?? 0,
          name: scene.robotMapName ?? '',
          isCurrent,
          rooms: scene.rooms.length,
          version: vacuumSavedMapVersion({ index: scene.index, robotMapId: scene.robotMapId ?? 0 }),
        })),
      ),
    );
    this.source.savedMapsChanged(this.deviceId);
  }
}
