import { DatabaseSync } from 'node:sqlite';
import {
  PLUGIN_MODEL_CONTRIBUTION,
  resolveModel,
  createOverrideIndex,
  type LiveChange,
  type ModelDevice,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ModelCatalogService } from '../../src/models/catalog-service';
import {
  entryFromContribution,
  entryFromSpec,
  type ModelEntry,
} from '../../src/models/contributions';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ModelAssetsRepository, sha256Of } from '../../src/store/repositories/model-assets';
import { ModelCatalogRepository } from '../../src/store/repositories/model-catalog';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { jsonBytes, specOf } from './model-fixtures';

const NOW = '2026-10-25T10:00:00.000Z';
const COUNT = z.object({ count: z.number() });
const PLUGIN = 'plugin:wiz';

let database: DatabaseSync;
let assets: ModelAssetsRepository;
let catalog: ModelCatalogRepository;
let service: ModelCatalogService;
let changes: LiveChange[];
let logs: CapturedLogs;

beforeEach(() => {
  changes = [];
  logs = captureLogs();
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
  service = new ModelCatalogService({ assets, catalog });
});

function count(table: string): number {
  return COUNT.parse(database.prepare(`select count(*) as count from ${table}`).get()).count;
}

function pluginEntry(
  id: string,
  options: {
    version?: string;
    match?: Record<string, unknown>;
    aliases?: string[];
  } = {},
): ModelEntry {
  const version = options.version ?? '1.0.0';
  const meta =
    options.aliases === undefined
      ? {}
      : { meta: { names: { display: id }, aliases: options.aliases } };
  return entryFromContribution(
    PLUGIN_MODEL_CONTRIBUTION.parse({
      id,
      title: `Title of ${id}`,
      version,
      match: options.match ?? { exact: ['wiz.fan'] },
      spec: `models/${id}.json`,
      brands: ['WiZ'],
    }),
    { spec: jsonBytes(specOf(id, version, meta)) },
  );
}

function device(overrides: Partial<ModelDevice> = {}): ModelDevice {
  return { id: 'd1', brand: 'WiZ', model: 'wiz.fan', family: 'fan', ...overrides };
}

describe('assembling the catalogue', () => {
  it('stores built-in, provider and plugin models under their own owners and streams every row', () => {
    service.replace({ owner: 'builtin', entries: [entryFromSpec(specOf('dev.fan.default'))] });
    service.replace({
      owner: 'provider:xiaomi',
      entries: [
        entryFromSpec(specOf('dev.fan.xiaomi'), {
          match: { exact: ['x.fan'] },
          brands: ['Xiaomi'],
        }),
      ],
    });
    const result = service.replace({
      owner: PLUGIN,
      entries: [pluginEntry('dev.fan.wiz')],
    });
    expect(result).toMatchObject({ accepted: ['dev.fan.wiz'], inserted: 1, statusDetail: null });
    expect(catalog.all().map((row) => [row.id, row.owner])).toStrictEqual([
      ['dev.fan.default', 'builtin'],
      ['dev.fan.wiz', PLUGIN],
      ['dev.fan.xiaomi', 'provider:xiaomi'],
    ]);
    expect(count('model_assets')).toBe(3);
    expect(changes.filter((change) => change.table === 'model_catalog')).toHaveLength(3);
    expect(changes.filter((change) => change.table === 'model_assets')).toHaveLength(3);
  });

  it('changes nothing and streams nothing when the same models arrive again', () => {
    service.replace({ owner: PLUGIN, entries: [pluginEntry('dev.fan.wiz')] });
    changes = [];
    const again = service.replace({ owner: PLUGIN, entries: [pluginEntry('dev.fan.wiz')] });
    expect(again).toMatchObject({ inserted: 0, updated: 0, deleted: 0, released: 0 });
    expect(changes).toStrictEqual([]);
  });

  it('moves a new version to its new hash and releases the superseded asset', () => {
    service.replace({ owner: PLUGIN, entries: [pluginEntry('dev.fan.wiz')] });
    const before = catalog.all()[0]?.spec_sha256;
    const result = service.replace({
      owner: PLUGIN,
      entries: [pluginEntry('dev.fan.wiz', { version: '1.1.0' })],
    });
    const after = catalog.all()[0];
    expect(result).toMatchObject({ updated: 1, released: 1 });
    expect(after?.version).toBe('1.1.0');
    expect(after?.spec_sha256).not.toBe(before);
    expect(assets.find(before ?? '')).toBeUndefined();
    expect(count('model_assets')).toBe(1);
  });

  it('removes an owner with its rows and the assets nothing else uses', () => {
    service.replace({ owner: PLUGIN, entries: [pluginEntry('dev.fan.wiz')] });
    const other = service.replace({
      owner: 'plugin:other',
      entries: [pluginEntry('dev.fan.other')],
    });
    expect(other.accepted).toStrictEqual(['dev.fan.other']);
    expect(service.remove(PLUGIN)).toMatchObject({ deleted: 1, released: 1 });
    expect(catalog.all().map((row) => row.id)).toStrictEqual(['dev.fan.other']);
    expect(count('model_assets')).toBe(1);
  });

  it('shares one asset between two owners that ship the same bytes', () => {
    const entry = entryFromSpec(specOf('dev.fan.same'), { match: { exact: ['a'] } });
    service.replace({ owner: 'provider:a', entries: [entry] });
    service.replace({ owner: 'provider:b', entries: [entry] });
    expect(count('model_assets')).toBe(1);
    expect(service.remove('provider:a').released).toBe(0);
    expect(count('model_assets')).toBe(1);
  });

  it('refuses an owner that is not builtin, provider or plugin', () => {
    expect(() => service.replace({ owner: 'user:alice', entries: [] })).toThrow();
    expect(() => service.replace({ owner: 'wiz', entries: [] })).toThrow();
  });
});

describe('rejected models', () => {
  it('keeps the good models, drops the bad one and names the file for the plugin status', () => {
    const bad = entryFromContribution(
      PLUGIN_MODEL_CONTRIBUTION.parse({
        id: 'dev.fan.bad',
        title: 'Bad',
        version: '1.0.0',
        match: { exact: ['bad'] },
        spec: 'models/bad.json',
      }),
      { spec: new TextEncoder().encode('nope') },
    );
    const result = service.replace({ owner: PLUGIN, entries: [pluginEntry('dev.fan.good'), bad] });
    expect(result.accepted).toStrictEqual(['dev.fan.good']);
    expect(result.statusDetail).toContain('models/bad.json (dev.fan.bad)');
    expect(catalog.all().map((row) => row.id)).toStrictEqual(['dev.fan.good']);
  });

  it('removes a model whose update no longer loads and says why', () => {
    service.replace({ owner: PLUGIN, entries: [pluginEntry('dev.fan.wiz')] });
    const broken = entryFromContribution(
      PLUGIN_MODEL_CONTRIBUTION.parse({
        id: 'dev.fan.wiz',
        title: 'Wiz',
        version: '1.1.0',
        match: { exact: ['wiz.fan'] },
        spec: 'models/wiz.json',
      }),
      { spec: { problem: 'leaves the plugin folder' } },
    );
    const result = service.replace({ owner: PLUGIN, entries: [broken] });
    expect(result).toMatchObject({
      deleted: 1,
      statusDetail: 'Model files rejected: models/wiz.json (dev.fan.wiz) leaves the plugin folder',
    });
    expect(count('model_catalog')).toBe(0);
  });

  it('refuses a plugin id or alias that another owner already provides', () => {
    service.replace({
      owner: 'builtin',
      entries: [
        entryFromSpec(
          specOf('dev.fan.tower', '1.0.0', {
            meta: { names: { display: 'T' }, aliases: ['home-map.tower'] },
          }),
        ),
      ],
    });
    const result = service.replace({
      owner: PLUGIN,
      entries: [
        pluginEntry('dev.fan.tower', { version: '9.0.0' }),
        pluginEntry('dev.fan.sneaky', { aliases: ['home-map.tower'] }),
        pluginEntry('dev.fan.fine'),
      ],
    });
    expect(result.accepted).toStrictEqual(['dev.fan.fine']);
    expect(result.rejections.map((item) => item.problem)).toStrictEqual([
      'uses the name dev.fan.tower, which builtin provides',
      'uses the name home-map.tower, which builtin provides',
    ]);
    expect(service.catalog().find('dev.fan.tower')?.owner).toBe('builtin');
  });

  it('refuses a second model of one batch that reuses an id or alias of the first', () => {
    const result = service.replace({
      owner: PLUGIN,
      entries: [
        pluginEntry('dev.fan.a', { aliases: ['dev.fan.x'] }),
        pluginEntry('dev.fan.b', { aliases: ['dev.fan.x'] }),
      ],
    });
    expect(result.accepted).toStrictEqual(['dev.fan.a']);
    expect(result.rejections[0]?.problem).toBe(
      'uses the name dev.fan.x, already listed by dev.fan.a',
    );
  });
});

describe('what reaches the logs', () => {
  it('holds ids, hashes and counts and never a model document', () => {
    const entry = pluginEntry('dev.fan.wiz', { aliases: ['dev.fan.old'] });
    service.replace({ owner: PLUGIN, entries: [entry] });
    service.replace({
      owner: PLUGIN,
      entries: [
        entryFromContribution(
          PLUGIN_MODEL_CONTRIBUTION.parse({
            id: 'dev.fan.bad',
            title: 'x',
            version: '1.0.0',
            match: { exact: ['q'] },
            spec: 'bad.json',
          }),
          { spec: new TextEncoder().encode('{"parts":"private"}') },
        ),
      ],
    });
    const text = JSON.stringify(logs.records);
    expect(logs.events()).toContain('model_catalog.replace.succeeded');
    expect(logs.events()).toContain('model_catalog.model_rejected');
    expect(logs.events()).toContain('model_catalog.model_admitted');
    expect(text).toContain('dev.fan.wiz');
    expect(count('model_catalog')).toBe(0);
    expect(text).not.toContain('footprint');
    expect(text).not.toContain('private');
    expect(text).not.toContain('materials');
    const admitted = logs.records.find((record) => record.event === 'model_catalog.model_admitted');
    expect(admitted?.payload).toMatchObject({
      specSha256: sha256Of(
        jsonBytes(
          specOf('dev.fan.wiz', '1.0.0', {
            meta: { names: { display: 'dev.fan.wiz' }, aliases: ['dev.fan.old'] },
          }),
        ),
      ),
    });
  });

  it('logs a tie the resolver reports with its ids', () => {
    service.reportTie({ deviceId: 'd1', tier: 'exact', winner: 'dev.a', rival: 'dev.b' });
    const record = logs.records.find((item) => item.event === 'model_resolution.tie_broken');
    expect(record?.payload).toMatchObject({ deviceId: 'd1', winner: 'dev.a', rival: 'dev.b' });
  });
});

describe('the assembled catalogue in the resolver', () => {
  it('lets the resolver pick a plugin model by identity and find a model by alias', () => {
    service.replace({ owner: 'builtin', entries: [entryFromSpec(specOf('dev.fan.default'))] });
    service.replace({
      owner: PLUGIN,
      entries: [pluginEntry('dev.fan.wiz', { aliases: ['dev.fan.old'] })],
    });
    const resolution = resolveModel(
      device(),
      {
        catalog: service.catalog(),
        overrides: createOverrideIndex([]),
        defaults: {
          kindDefaults: new Map([['fan', 'dev.fan.default']]),
          irCategoryDefaults: new Map(),
        },
      },
      { onTie: service.reportTie },
    );
    expect(resolution).toMatchObject({
      source: 'plugin-identity',
      main: { kind: 'catalogue', modelId: 'dev.fan.wiz' },
    });
    expect(service.catalog().find('dev.fan.old')?.id).toBe('dev.fan.wiz');
    const other = resolveModel(device({ model: 'unknown' }), {
      catalog: service.catalog(),
      overrides: createOverrideIndex([]),
      defaults: {
        kindDefaults: new Map([['fan', 'dev.fan.default']]),
        irCategoryDefaults: new Map(),
      },
    });
    expect(other.source).toBe('kind-default');
  });
});

describe('a user spec', () => {
  it('is validated and stored under the user and returned by hash', () => {
    const bytes = jsonBytes(specOf('dev.fan.mine'));
    const stored = service.storeUserSpec('alice', bytes);
    expect(stored).toStrictEqual({
      stored: true,
      sha256: sha256Of(bytes),
      modelId: 'dev.fan.mine',
    });
    expect(assets.find(sha256Of(bytes))).toMatchObject({ kind: 'spec', owner: 'user:alice' });
    expect(count('model_catalog')).toBe(0);
  });

  it('is refused with the reason and nothing is stored', () => {
    const stored = service.storeUserSpec('alice', new TextEncoder().encode('{"schema":1}'));
    expect(stored).toMatchObject({ stored: false });
    expect(count('model_assets')).toBe(0);
    expect(logs.events()).toContain('model_asset.user_spec_rejected');
  });
});
