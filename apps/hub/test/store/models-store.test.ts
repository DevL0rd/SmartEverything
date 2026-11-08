import { DatabaseSync } from 'node:sqlite';
import type { LiveChange, ModelCatalogRow } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ModelAssetsRepository, sha256Of } from '../../src/store/repositories/model-assets';
import { ModelCatalogRepository } from '../../src/store/repositories/model-catalog';
import { ModelOverridesRepository } from '../../src/store/repositories/model-overrides';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-25T10:00:00.000Z';
const COUNT = z.object({ count: z.number() });
const SPEC_BYTES = new TextEncoder().encode('{"schema":1,"id":"dev.fan.example"}');
const ASSET_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const NEXT_SPEC_BYTES = new TextEncoder().encode('{"schema":1,"id":"dev.fan.example","v":2}');
const PLUGIN = 'plugin:wiz';

let database: DatabaseSync;
let assets: ModelAssetsRepository;
let catalog: ModelCatalogRepository;
let overrides: ModelOverridesRepository;
let changes: LiveChange[];

function build(): void {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const feed = new ChangeFeed(testLogger('store'));
  feed.subscribe((change) => {
    changes.push(change);
  });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, feed, () => new Date(NOW));
  assets = new ModelAssetsRepository(context);
  catalog = new ModelCatalogRepository(context);
  overrides = new ModelOverridesRepository(context);
}

beforeEach(() => {
  changes = [];
  build();
});

function count(table: string): number {
  return COUNT.parse(database.prepare(`select count(*) as count from ${table}`).get()).count;
}

function model(overrides: Partial<ModelCatalogRow> = {}): ModelCatalogRow {
  return {
    id: 'dev.fan.example',
    version: '1.0.0',
    owner: PLUGIN,
    title: 'Example fan',
    category: 'fan',
    match: {
      exact: ['wiz.fan'],
      prefix: [],
      normalised: [],
      product: [],
      hardwareModel: [],
      families: [],
    },
    brands: ['WiZ'],
    aliases: ['dev.fan.old'],
    extras: [{ role: 'dock', modelId: 'dev.dock.example' }],
    spec_sha256: sha256Of(SPEC_BYTES),
    ...overrides,
  };
}

function seedSpec(bytes: Uint8Array = SPEC_BYTES): string {
  return assets.save({ kind: 'spec', owner: PLUGIN, bytes }).sha256;
}

describe('model assets', () => {
  it('hashes the bytes itself, keeps them and streams a row without the bytes', () => {
    const row = assets.save({ kind: 'spec', owner: 'builtin', bytes: ASSET_BYTES });
    expect(row).toStrictEqual({
      sha256: sha256Of(ASSET_BYTES),
      kind: 'spec',
      size: ASSET_BYTES.length,
      owner: 'builtin',
      created: NOW,
    });
    expect(assets.bytes(row.sha256)).toStrictEqual({
      kind: 'spec',
      size: ASSET_BYTES.length,
      bytes: ASSET_BYTES,
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ table: 'model_assets', operation: 'INSERT', record: row });
    expect(changes[0]?.record).not.toHaveProperty('bytes');
  });

  it('stores identical bytes once and keeps the first owner without a second change', () => {
    const first = assets.save({ kind: 'spec', owner: PLUGIN, bytes: SPEC_BYTES });
    const again = assets.save({ kind: 'spec', owner: 'user:alice', bytes: SPEC_BYTES });
    expect(again).toStrictEqual(first);
    expect(count('model_assets')).toBe(1);
    expect(changes).toHaveLength(1);
  });

  it('refuses the same bytes under another kind and an empty file', () => {
    assets.save({ kind: 'spec', owner: PLUGIN, bytes: SPEC_BYTES });
    expect(() => assets.save({ kind: 'glb', owner: PLUGIN, bytes: SPEC_BYTES })).toThrow(
      'already stored as spec',
    );
    expect(() => assets.save({ kind: 'spec', owner: PLUGIN, bytes: new Uint8Array() })).toThrow();
    expect(count('model_assets')).toBe(1);
  });

  it('releases only assets nothing uses and reports the removal live', () => {
    const used = seedSpec();
    const spare = seedSpec(NEXT_SPEC_BYTES);
    catalog.replaceOwner(PLUGIN, [model({ spec_sha256: used })]);
    changes = [];
    expect(assets.release([used, spare, spare, sha256Of(ASSET_BYTES)])).toBe(1);
    expect(assets.find(used)).toBeDefined();
    expect(assets.find(spare)).toBeUndefined();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ table: 'model_assets', operation: 'DELETE', record: null });
  });

  it('keeps an asset an override uses', () => {
    const glb = assets.save({ kind: 'glb', owner: 'user:alice', bytes: ASSET_BYTES }).sha256;
    overrides.set({ scope: 'device', target: 'd1', assetHash: glb, setBy: 'profile:alice' });
    expect(assets.release([glb])).toBe(0);
    overrides.reset('device', 'd1');
    expect(assets.release([glb])).toBe(1);
  });
});

describe('the model catalogue', () => {
  it('adds the rows of an owner and streams each one', () => {
    seedSpec();
    changes = [];
    const result = catalog.replaceOwner(PLUGIN, [model()]);
    expect(result).toStrictEqual({ inserted: 1, updated: 0, deleted: 0, superseded: [] });
    expect(catalog.forOwner(PLUGIN)).toStrictEqual([model()]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      table: 'model_catalog',
      operation: 'INSERT',
      oldRecord: null,
    });
  });

  it('streams nothing when the same rows are written again', () => {
    seedSpec();
    catalog.replaceOwner(PLUGIN, [model()]);
    changes = [];
    expect(catalog.replaceOwner(PLUGIN, [model()])).toStrictEqual({
      inserted: 0,
      updated: 0,
      deleted: 0,
      superseded: [],
    });
    expect(changes).toHaveLength(0);
  });

  it('updates a new version, streams the old row with it and names the superseded hash', () => {
    const first = seedSpec();
    const second = seedSpec(NEXT_SPEC_BYTES);
    catalog.replaceOwner(PLUGIN, [model({ spec_sha256: first })]);
    changes = [];
    const next = model({ version: '1.1.0', spec_sha256: second });
    const result = catalog.replaceOwner(PLUGIN, [next]);
    expect(result).toStrictEqual({ inserted: 0, updated: 1, deleted: 0, superseded: [first] });
    expect(changes[0]).toMatchObject({
      table: 'model_catalog',
      operation: 'UPDATE',
      record: next,
      oldRecord: { version: '1.0.0' },
    });
    expect(assets.release(result.superseded)).toBe(1);
    expect(assets.find(second)).toBeDefined();
  });

  it('deletes the rows an owner stops providing and leaves other owners alone', () => {
    const spec = seedSpec();
    catalog.replaceOwner(PLUGIN, [model(), model({ id: 'dev.lamp.example', spec_sha256: spec })]);
    catalog.replaceOwner('provider:xiaomi', [model({ owner: 'provider:xiaomi' })]);
    changes = [];
    const result = catalog.replaceOwner(PLUGIN, [model()]);
    expect(result).toMatchObject({ inserted: 0, updated: 0, deleted: 1 });
    expect(catalog.forOwner(PLUGIN).map((row) => row.id)).toStrictEqual(['dev.fan.example']);
    expect(catalog.all()).toHaveLength(2);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      table: 'model_catalog',
      operation: 'DELETE',
      record: null,
      oldRecord: { id: 'dev.lamp.example' },
    });
    expect(catalog.replaceOwner(PLUGIN, [])).toMatchObject({ deleted: 1 });
    expect(catalog.forOwner('provider:xiaomi')).toHaveLength(1);
  });

  it('refuses a row of another owner, a repeated id and a row naming an asset that is not stored, writing nothing', () => {
    seedSpec();
    changes = [];
    expect(() => catalog.replaceOwner(PLUGIN, [model({ owner: 'plugin:other' })])).toThrow(
      'plugin:other',
    );
    expect(() => catalog.replaceOwner(PLUGIN, [model(), model({ version: '2.0.0' })])).toThrow(
      'more than once',
    );
    expect(() =>
      catalog.replaceOwner(PLUGIN, [
        model({ id: 'dev.lamp.example', spec_sha256: sha256Of(ASSET_BYTES) }),
      ]),
    ).toThrow();
    expect(() => catalog.replaceOwner(PLUGIN, [model({ id: 'Not A Model' })])).toThrow();
    expect(count('model_catalog')).toBe(0);
    expect(changes).toHaveLength(0);
  });

  it('rolls the whole replacement back when one row fails', () => {
    seedSpec();
    catalog.replaceOwner(PLUGIN, [model()]);
    changes = [];
    const broken = model({ id: 'dev.lamp.example', spec_sha256: sha256Of(ASSET_BYTES) });
    expect(() => catalog.replaceOwner(PLUGIN, [model({ title: 'Renamed' }), broken])).toThrow();
    expect(catalog.forOwner(PLUGIN)).toStrictEqual([model()]);
    expect(changes).toHaveLength(0);
  });

  it('keeps the same model id from two owners side by side', () => {
    seedSpec();
    catalog.replaceOwner(PLUGIN, [model()]);
    catalog.replaceOwner('provider:xiaomi', [
      model({ owner: 'provider:xiaomi', version: '2.0.0' }),
    ]);
    expect(catalog.all().map((row) => [row.id, row.owner, row.version])).toStrictEqual([
      ['dev.fan.example', PLUGIN, '1.0.0'],
      ['dev.fan.example', 'provider:xiaomi', '2.0.0'],
    ]);
  });
});

describe('model overrides', () => {
  it('sets, replaces and resets an override, streaming each step', () => {
    const first = overrides.set({
      scope: 'device',
      target: 'd1',
      modelId: 'dev.fan.example',
      finish: 'graphite',
      params: { width: 1.2 },
      setBy: 'profile:alice',
    });
    expect(first).toStrictEqual({
      scope: 'device',
      target: 'd1',
      model_id: 'dev.fan.example',
      asset_hash: null,
      finish: 'graphite',
      params: { width: 1.2 },
      set_by: 'profile:alice',
      updated_at: NOW,
    });
    const second = overrides.set({
      scope: 'device',
      target: 'd1',
      modelId: 'dev.lamp.example',
      setBy: 'profile:bob',
    });
    expect(second).toMatchObject({
      model_id: 'dev.lamp.example',
      finish: null,
      params: {},
      set_by: 'profile:bob',
    });
    expect(overrides.all()).toStrictEqual([second]);
    expect(overrides.reset('device', 'd1')).toStrictEqual(second);
    expect(overrides.find('device', 'd1')).toBeUndefined();
    expect(changes.map((change) => [change.table, change.operation])).toStrictEqual([
      ['model_overrides', 'INSERT'],
      ['model_overrides', 'UPDATE'],
      ['model_overrides', 'DELETE'],
    ]);
    expect(changes[1]).toMatchObject({ record: second, oldRecord: first });
    expect(changes[2]).toMatchObject({ record: null, oldRecord: second });
  });

  it('keeps device, identity and family overrides apart', () => {
    const identity = JSON.stringify(['wiz', 'wiz bulb', '']);
    overrides.set({ scope: 'device', target: 'd1', modelId: 'dev.fan.example', setBy: 'p' });
    overrides.set({ scope: 'identity', target: identity, modelId: 'dev.fan.example', setBy: 'p' });
    overrides.set({ scope: 'family', target: 'fan', modelId: 'dev.fan.example', setBy: 'p' });
    expect(overrides.all().map((row) => row.scope)).toStrictEqual(['device', 'family', 'identity']);
    expect(overrides.find('identity', identity)?.target).toBe(identity);
  });

  it('points at an uploaded asset and refuses one that is not stored', () => {
    const glb = assets.save({ kind: 'glb', owner: 'user:alice', bytes: ASSET_BYTES }).sha256;
    expect(
      overrides.set({ scope: 'family', target: 'fan', assetHash: glb, setBy: 'p' }),
    ).toMatchObject({
      model_id: null,
      asset_hash: glb,
    });
    changes = [];
    expect(() =>
      overrides.set({ scope: 'device', target: 'd2', assetHash: sha256Of(SPEC_BYTES), setBy: 'p' }),
    ).toThrow();
    expect(changes).toHaveLength(0);
  });

  it('refuses a model and an asset together, neither, and a family override for a non-family', () => {
    const asset = sha256Of(ASSET_BYTES);
    expect(() =>
      overrides.set({
        scope: 'device',
        target: 'd1',
        modelId: 'dev.fan.example',
        assetHash: asset,
        setBy: 'p',
      }),
    ).toThrow();
    expect(() => overrides.set({ scope: 'device', target: 'd1', setBy: 'p' })).toThrow();
    expect(() =>
      overrides.set({
        scope: 'family',
        target: 'toaster-oven',
        modelId: 'dev.fan.example',
        setBy: 'p',
      }),
    ).toThrow();
    expect(count('model_overrides')).toBe(0);
  });

  it('resetting an override that does not exist changes nothing', () => {
    expect(overrides.reset('device', 'nothing')).toBeUndefined();
    expect(changes).toHaveLength(0);
  });
});
