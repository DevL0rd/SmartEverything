import { DatabaseSync } from 'node:sqlite';
import type { VacuumClean, VacuumScene } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { VacuumCleansRepository } from '../../src/store/repositories/vacuum-cleans';
import { VacuumScenesRepository } from '../../src/store/repositories/vacuum-scenes';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-24T10:00:00.000Z';
const ROBOT = 'robot';

let database: DatabaseSync;
let scenes: VacuumScenesRepository;
let cleans: VacuumCleansRepository;

function scene(index: number, slot: VacuumScene['slot'] = 'current', name = 'Home'): VacuumScene {
  return {
    index,
    slot,
    name,
    fetchedAt: NOW,
    bounds: { minX: 0, minY: 0, maxX: 4, maxY: 3 },
    rooms: [
      {
        id: 1,
        name: 'Kitchen',
        colour: 2,
        floor: 0,
        hidden: false,
        areaM2: 12,
        label: { x: 2, y: 1.5 },
        rings: [
          [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 3 },
          ],
        ],
        settings: null,
      },
    ],
    walls: [],
    doors: [],
    carpets: [],
    furniture: [],
    objects: [],
    zones: [],
    dock: { x: 0.5, y: 0.5, yaw: 0 },
    robot: null,
    trail: [{ mopping: false, points: [{ x: 1, y: 1 }] }],
  };
}

function clean(id: string, startedAt: string, patch: Partial<VacuumClean> = {}): VacuumClean {
  return {
    id,
    startedAt,
    endedAt: null,
    seconds: 0,
    areaM2: 0,
    scope: 'rooms',
    mode: 'sweep',
    rooms: [{ id: 1, name: 'Kitchen' }],
    outcome: null,
    batteryStart: 90,
    batteryEnd: null,
    mapIndex: 7,
    zones: [],
    trail: [{ mopping: false, points: [{ x: 1, y: 1 }] }],
    ...patch,
  };
}

function device(): void {
  database
    .prepare(
      `insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at)
       values (?, 'xiaomi', ?, 'vacuum', 'Robot', 'xiaomi.vacuum.pv11gl', 'Xiaomi', ?, ?)`,
    )
    .run(ROBOT, ROBOT, NOW, NOW);
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  scenes = new VacuumScenesRepository(context);
  cleans = new VacuumCleansRepository(context);
  device();
});

describe('the vacuum scene cache', () => {
  it('keeps every index per slot and returns the highest as the latest', () => {
    scenes.save(ROBOT, scene(3));
    scenes.save(ROBOT, scene(9));
    scenes.save(ROBOT, scene(5));
    scenes.save(ROBOT, scene(2, 'saved'));
    expect(scenes.indexes(ROBOT, 'current')).toStrictEqual([9, 5, 3]);
    expect(scenes.latest(ROBOT, 'current')?.index).toBe(9);
    expect(scenes.latest(ROBOT, 'saved')?.index).toBe(2);
    expect(scenes.latest(ROBOT, 'backup')).toBeUndefined();
    expect(scenes.at(ROBOT, 'current', 3)).toStrictEqual(scene(3));
    expect(scenes.at(ROBOT, 'current', 4)).toBeUndefined();
  });

  it('replaces a scene fetched again for the same index and tells whether an index is cached', () => {
    scenes.save(ROBOT, scene(3, 'current', 'Old'));
    scenes.save(ROBOT, scene(3, 'current', 'New'));
    expect(scenes.indexes(ROBOT, 'current')).toStrictEqual([3]);
    expect(scenes.at(ROBOT, 'current', 3)?.name).toBe('New');
    expect(scenes.has(ROBOT, 'current', 3)).toBe(true);
    expect(scenes.has(ROBOT, 'saved', 3)).toBe(false);
  });

  it('forgets the scenes with their device', () => {
    scenes.save(ROBOT, scene(3));
    database.prepare('delete from devices where id = ?').run(ROBOT);
    expect(scenes.indexes(ROBOT, 'current')).toStrictEqual([]);
  });
});

describe('the vacuum clean log', () => {
  it('reopens the one clean that has not ended and closes it when saved again', () => {
    cleans.save(
      ROBOT,
      clean('a', '2026-10-23T08:00:00.000Z', {
        outcome: 'finished',
        endedAt: '2026-10-23T08:30:00.000Z',
      }),
    );
    cleans.save(ROBOT, clean('b', '2026-10-24T08:00:00.000Z'));
    expect(cleans.open(ROBOT)?.id).toBe('b');
    const closed = clean('b', '2026-10-24T08:00:00.000Z', {
      endedAt: '2026-10-24T08:20:00.000Z',
      seconds: 1200,
      areaM2: 31.5,
      outcome: 'finished',
      batteryEnd: 71,
      trail: [
        {
          mopping: true,
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        },
      ],
    });
    cleans.save(ROBOT, closed);
    expect(cleans.open(ROBOT)).toBeUndefined();
    expect(cleans.get(ROBOT, 'b')).toStrictEqual(closed);
    expect(cleans.get(ROBOT, 'missing')).toBeUndefined();
  });

  it('renames a running clean to its task id and keeps the row it was stored in', () => {
    const running = clean('start-a', '2026-10-24T08:00:00.000Z');
    cleans.save(ROBOT, running);
    cleans.rename(ROBOT, 'start-a', 'task-7');
    expect(cleans.get(ROBOT, 'start-a')).toBeUndefined();
    expect(cleans.get(ROBOT, 'task-7')).toStrictEqual({ ...running, id: 'task-7' });
    expect(cleans.list(ROBOT)).toHaveLength(1);
  });

  it('lists summaries newest first without the trajectory, within a range and a limit', () => {
    cleans.save(ROBOT, clean('a', '2026-10-22T08:00:00.000Z'));
    cleans.save(ROBOT, clean('b', '2026-10-23T08:00:00.000Z'));
    cleans.save(ROBOT, clean('c', '2026-10-24T08:00:00.000Z'));
    const all = cleans.list(ROBOT);
    expect(all.map((row) => row.id)).toStrictEqual(['c', 'b', 'a']);
    expect(Object.keys(all[0] ?? {})).not.toContain('trail');
    expect(cleans.list(ROBOT, { limit: 2 }).map((row) => row.id)).toStrictEqual(['c', 'b']);
    expect(
      cleans
        .list(ROBOT, { from: '2026-10-23T00:00:00.000Z', to: '2026-10-24T00:00:00.000Z' })
        .map((row) => row.id),
    ).toStrictEqual(['b']);
  });

  it('orders by the instant when a start carries an offset', () => {
    cleans.save(ROBOT, clean('late', '2026-10-24T01:00:00+07:00'));
    cleans.save(ROBOT, clean('early', '2026-10-23T20:00:00.000Z'));
    expect(cleans.list(ROBOT).map((row) => row.id)).toStrictEqual(['early', 'late']);
    expect(cleans.get(ROBOT, 'late')?.startedAt).toBe('2026-10-23T18:00:00.000Z');
  });

  it('keeps cleans apart per device and forgets them with their device', () => {
    cleans.save(ROBOT, clean('a', '2026-10-24T08:00:00.000Z'));
    expect(cleans.list('other')).toStrictEqual([]);
    database.prepare('delete from devices where id = ?').run(ROBOT);
    expect(cleans.list(ROBOT)).toStrictEqual([]);
  });
});
