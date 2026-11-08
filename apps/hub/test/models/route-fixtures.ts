import { DatabaseSync } from 'node:sqlite';
import {
  PLUGIN_MODEL_CONTRIBUTION,
  createClientToken,
  createModelMetadataIndex,
  hashClientToken,
  type DeviceRow,
  type ModelDefaults,
} from '@smarteverything/domain';
import { ModelCatalogService } from '../../src/models/catalog-service';
import {
  entryFromContribution,
  entryFromSpec,
  type ModelEntry,
} from '../../src/models/contributions';
import type { Caller } from '../../src/server/auth';
import { modelAssetRoutes, modelAuthorizer } from '../../src/server/handlers/model-assets';
import { modelRoutes, type ModelRouteServices } from '../../src/server/handlers/models';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ModelAssetsRepository } from '../../src/store/repositories/model-assets';
import { ModelCatalogRepository } from '../../src/store/repositories/model-catalog';
import { ModelOverridesRepository } from '../../src/store/repositories/model-overrides';
import { profileIdOf } from '../../src/server/auth';
import { Sql } from '../../src/store/sql';
import { testStore, type TestStore } from '../support/store';
import { testLogger } from '../support/logs';
import { jsonBytes, specOf } from './model-fixtures';

const NOW = '2026-10-25T10:00:00.000Z';

export const NO_DEFAULTS: ModelDefaults = {
  kindDefaults: new Map(),
  irCategoryDefaults: new Map(),
};

export interface Harness {
  readonly test: TestStore;
  readonly services: ModelRouteServices;
  readonly assets: ModelAssetsRepository;
  readonly catalog: ModelCatalogRepository;
  readonly overrides: ModelOverridesRepository;
  readonly service: ModelCatalogService;
  readonly owner: Caller;
  readonly member: Caller;
  readonly tokens: { readonly owner: string; readonly member: string };
  readonly routes: ReturnType<typeof modelRoutes>;
  readonly rawRoutes: ReturnType<typeof modelAssetRoutes>;
  readonly close: () => Promise<void>;
}

function clientOf(
  test: TestStore,
  role: 'owner' | 'member',
): { readonly caller: Caller; readonly token: string } {
  const token = createClientToken();
  const row = test.store.clients.create({
    name: role,
    platform: 'android',
    role,
    tokenHash: hashClientToken(token),
  });
  return { caller: { kind: 'client', client: row }, token };
}

export async function harness(defaults: ModelDefaults = NO_DEFAULTS): Promise<Harness> {
  const test = await testStore();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  const assets = new ModelAssetsRepository(context);
  const catalog = new ModelCatalogRepository(context);
  const overrides = new ModelOverridesRepository(context);
  const service = new ModelCatalogService({ assets, catalog });
  const owner = clientOf(test, 'owner');
  const member = clientOf(test, 'member');
  const services: ModelRouteServices = {
    devices: test.store.devices,
    catalog: service,
    overrides,
    assets,
    metadata: createModelMetadataIndex([]),
    defaults: () => defaults,
    profileOf: (caller) => profileIdOf(test.store, caller),
    authorize: modelAuthorizer(test.store),
  };
  return {
    test,
    services,
    assets,
    catalog,
    overrides,
    service,
    owner: owner.caller,
    member: member.caller,
    tokens: { owner: owner.token, member: member.token },
    routes: modelRoutes(services),
    rawRoutes: modelAssetRoutes(services),
    close: async (): Promise<void> => {
      database.close();
      await test.close();
    },
  };
}

export function addDevice(
  test: TestStore,
  fields: {
    readonly model: string;
    readonly manufacturer?: string;
    readonly kind?: DeviceRow['kind'];
    readonly details?: DeviceRow['details'];
    readonly externalId?: string;
  },
): DeviceRow {
  const [row] = test.store.devices.upsert([
    {
      provider: 'local',
      externalId: fields.externalId ?? fields.model,
      parentId: null,
      kind: fields.kind ?? 'fan',
      name: fields.model,
      model: fields.model,
      manufacturer: fields.manufacturer ?? 'WiZ',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: fields.details ?? {},
    },
  ]);
  if (row === undefined) throw new Error('the device was not stored');
  return row;
}

export function pluginEntry(
  id: string,
  options: {
    readonly match?: Record<string, unknown>;
    readonly brands?: readonly string[];
    readonly extra?: Record<string, unknown>;
    readonly title?: string;
  } = {},
): ModelEntry {
  return entryFromContribution(
    PLUGIN_MODEL_CONTRIBUTION.parse({
      id,
      title: options.title ?? `Title of ${id}`,
      version: '1.0.0',
      match: options.match ?? { exact: ['wiz.fan'] },
      spec: `models/${id}.json`,
      brands: options.brands ?? ['WiZ'],
    }),
    { spec: jsonBytes(specOf(id, '1.0.0', options.extra ?? {})) },
  );
}

export function builtinEntry(id: string, extra: Record<string, unknown> = {}): ModelEntry {
  return entryFromSpec(specOf(id, '1.0.0', extra), { match: { families: ['fan'] } });
}

export const DARK_FINISHES = {
  finishes: { dark: { body: { color: '#111111' } } },
  defaultFinish: 'dark',
};
