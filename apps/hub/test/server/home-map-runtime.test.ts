import { HOME_MAP_SUMMARY, HOME_MAP_VERSION, type ClientRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleHomeMap, type HomeMapRuntime } from '../../src/home-map/home-map-hub';
import type { Caller } from '../../src/server/auth';
import { homeMapSetRoutes } from '../../src/server/handlers/home-map-set';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-10-25T10:00:00.000Z';

let opened: TestStore;
let runtime: HomeMapRuntime;
let routes: ReturnType<typeof homeMapSetRoutes>;
let member: Caller;

const call = (route: Bound, raw: { params?: unknown; body?: unknown } = {}): Promise<unknown> =>
  route.run(
    member,
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

beforeEach(async () => {
  opened = await testStore(() => new Date(NOW));
  runtime = assembleHomeMap({
    store: opened.store,
    vacuums: {
      scenes: { latest: () => undefined, robotMap: () => undefined },
      control: { value: () => undefined, run: () => Promise.resolve() },
    },
    scansDirectory: opened.layout.home.homeMapScans,
    now: () => new Date(NOW),
    log: testLogger('home-map'),
  });
  routes = homeMapSetRoutes({ homeMap: runtime, store: opened.store });
  const client: ClientRow = opened.store.clients.create(
    { name: 'Member', platform: 'desktop', role: 'member', tokenHash: 'a'.repeat(64) },
    true,
  );
  member = { kind: 'client', client };
});

afterEach(async () => {
  await opened.close();
});

describe('the assembled runtime serves the map set endpoints', () => {
  it('creates, lists, versions, restores and deletes maps through the real services', async () => {
    const created = HOME_MAP_SUMMARY.parse(
      await call(routes.createHomeMap, { body: { name: 'Upstairs' } }),
    );
    const listed = await call(routes.listHomeMaps);
    expect(listed).toEqual([expect.objectContaining({ id: created.id, isDefault: true })]);
    const version = HOME_MAP_VERSION.parse(
      await call(routes.saveHomeMapVersion, { params: { mapId: created.id }, body: { name: 'A' } }),
    );
    await expect(
      call(routes.listHomeMapVersions, { params: { mapId: created.id } }),
    ).resolves.toEqual([expect.objectContaining({ versionId: version.versionId })]);
    await expect(
      call(routes.restoreHomeMapVersion, {
        params: { mapId: created.id, versionId: version.versionId },
      }),
    ).resolves.toHaveProperty('revision');
    await call(routes.deleteHomeMap, { params: { mapId: created.id } });
    await expect(call(routes.listHomeMaps)).resolves.toEqual([]);
  });

  it('lists no robot map feeds without a robot', async () => {
    await expect(call(routes.listRobotMapFeeds)).resolves.toEqual([]);
  });
});
