import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import {
  API_ENDPOINTS,
  BUILD_SOURCE_SETTINGS_UPDATE,
  DEFAULT_BUILD_SOURCES,
  PIPELINE_COMPONENTS,
  RELEASE_ARTIFACTS,
  buildSourceSettingId,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubLayout } from '../../src/data-layout';
import { BuildSourceMissingError, buildSourceOf } from '../../src/self-update/build-source';
import {
  hubBuildRefusal,
  requireHubBuild,
  HubBuildRefusedError,
} from '../../src/self-update/command';
import { openSeededStore, type SeededStore } from '../support/store';
import { testLogger } from '../support/logs';
import { testLayout } from '../support/test-layout';
import { testStoreHost } from '../support/store-host';

let scratch: string;
let layout: HubLayout;
let store: SeededStore;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'build-source-'));
  layout = await testLayout(scratch);
  await mkdir(dirname(layout.system.database.file), { recursive: true });
  store = await openSeededStore({
    host: testStoreHost(),
    path: layout.system.database.file,
    log: testLogger('store'),
    now: () => new Date('2026-11-14T10:00:00.000Z'),
    systemTimeZone: 'UTC',
    driveFolders: null,
  });
});

afterEach(async () => {
  await store.close();
  await rm(scratch, { recursive: true, force: true });
});

describe('the build source setting', () => {
  it('has a unique setting id per artifact', () => {
    expect(RELEASE_ARTIFACTS.map(buildSourceSettingId)).toEqual([
      'updates.buildSource.hub',
      'updates.buildSource.apk',
      'updates.buildSource.ui',
      'updates.buildSource.desktop',
    ]);
  });

  it('starts as provided for every artifact', async () => {
    expect(await store.host.read('buildSources', null)).toEqual(DEFAULT_BUILD_SOURCES);
    expect(Object.values(await store.host.read('buildSources', null))).toEqual([
      'provided',
      'provided',
      'provided',
      'provided',
    ]);
  });

  it('changes only the named artifacts', async () => {
    const next = await store.host.write('buildSourcesUpdate', { apk: 'github', ui: 'hub' });
    expect(next).toEqual({ hub: 'provided', apk: 'github', ui: 'hub', desktop: 'provided' });
    expect(await store.host.read('buildSources', null)).toEqual(next);
  });

  it('refuses an update that names nothing or an unknown source', () => {
    expect(BUILD_SOURCE_SETTINGS_UPDATE.safeParse({}).success).toBe(false);
    expect(BUILD_SOURCE_SETTINGS_UPDATE.safeParse({ hub: 'nas' }).success).toBe(false);
    expect(BUILD_SOURCE_SETTINGS_UPDATE.safeParse({ app: 'hub' }).success).toBe(false);
  });

  it('is an owner-only endpoint pair', () => {
    expect(API_ENDPOINTS.readBuildSources.access).toBe('owner');
    expect(API_ENDPOINTS.updateBuildSources.access).toBe('owner');
  });

  it('reports a missing row instead of guessing', async () => {
    const database = new DatabaseSync(layout.system.database.file);
    database.exec("delete from ai_settings where key = 'updates.buildSource.desktop'");
    database.close();
    await expect(buildSourceOf(layout, 'desktop')).rejects.toThrow(BuildSourceMissingError);
  });
});

describe('the Hub build gate reading the setting', () => {
  it.each(PIPELINE_COMPONENTS)('refuses %s while it is provided', async (component) => {
    expect(await buildSourceOf(layout, component)).toBe('provided');
    expect(await hubBuildRefusal(layout, component)).toMatch(/build source is provided, not hub/u);
    await expect(requireHubBuild(layout, component)).rejects.toThrow(HubBuildRefusedError);
  });

  it('points a github artifact at its release', async () => {
    await store.host.write('buildSourcesUpdate', { apk: 'github' });
    expect(await hubBuildRefusal(layout, 'app')).toMatch(
      /build source is github, not hub\. Publish it as a GitHub release/u,
    );
  });

  it('lets only the artifact set to hub build, mapping app to apk', async () => {
    await store.host.write('buildSourcesUpdate', { apk: 'hub' });
    expect(await buildSourceOf(layout, 'app')).toBe('hub');
    expect(await hubBuildRefusal(layout, 'app')).toBeNull();
    expect(await hubBuildRefusal(layout, 'hub')).not.toBeNull();
    expect(await hubBuildRefusal(layout, 'ui')).not.toBeNull();
    expect(await hubBuildRefusal(layout, 'desktop')).not.toBeNull();
  });
});
