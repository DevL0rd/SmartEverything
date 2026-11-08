import { DatabaseSync } from 'node:sqlite';
import { HomeMapService } from '../../src/home-map/service';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { HomeMapsRepository } from '../../src/store/repositories/home-maps';
import type { StoredRoomLink } from '../../src/store/repositories/vacuum-room-links';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { NOW } from './import-fixtures';

export const storedService = (): HomeMapService => {
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  return new HomeMapService({
    maps: new HomeMapsRepository(context, () => undefined),
    knownModel: () => true,
    log: testLogger('home-map'),
  });
};

export const HOME_HALL = '7a1c0d3e-2b4f-4c6a-8d9e-0f1a2b3c4d5e';
export const HOME_DEN = '8b2d1e4f-3c5a-4d7b-9eaf-1a2b3c4d5e6f';

export const storedLink = (
  mapRoomId: number,
  roomId: string,
  roomName: string,
  missingSince: string | null = null,
): StoredRoomLink => ({
  mapRoomId,
  mapRoomName: `Robot ${String(mapRoomId)}`,
  roomId,
  roomName,
  linkedAt: NOW,
  missingSince,
});
