import { DatabaseSync } from 'node:sqlite';
import {
  MODEL_DEFAULTS,
  createOverrideIndex,
  resolveModel,
  type ModelDevice,
} from '@smarteverything/domain';
import { MODEL_REGISTRY } from '@smarteverything/models';
import { beforeEach, describe, expect, it } from 'vitest';
import { builtinModelBatches, seedBuiltinModels } from '../../src/models/builtin-models';
import { ModelCatalogService } from '../../src/models/catalog-service';
import { BUILTIN_PLUGINS } from '../../src/plugins/builtin';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ModelAssetsRepository } from '../../src/store/repositories/model-assets';
import { ModelCatalogRepository } from '../../src/store/repositories/model-catalog';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-02T14:00:00.000Z';

let catalog: ModelCatalogRepository;
let service: ModelCatalogService;

beforeEach(() => {
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  catalog = new ModelCatalogRepository(context);
  service = new ModelCatalogService({
    assets: new ModelAssetsRepository(context),
    catalog,
  });
});

function seed(): ReturnType<typeof seedBuiltinModels> {
  return seedBuiltinModels(service, builtinModelBatches(MODEL_REGISTRY, BUILTIN_PLUGINS));
}

function device(model: string, brand: string, family: ModelDevice['family']): ModelDevice {
  return { id: model, brand, manufacturer: brand, model, family };
}

function modelFor(subject: ModelDevice): string | null {
  const main = resolveModel(subject, {
    catalog: service.catalog(),
    overrides: createOverrideIndex([]),
    defaults: MODEL_DEFAULTS,
  }).main;
  return main?.kind === 'catalogue' ? main.modelId : null;
}

describe('built-in models in the hub catalogue', () => {
  it('admits every registry model and every built-in plugin model', () => {
    const results = seed();
    expect(results.flatMap((result) => result.rejections)).toStrictEqual([]);
    const pluginModels = BUILTIN_PLUGINS.reduce(
      (sum, plugin) => sum + (plugin.models ?? []).length,
      0,
    );
    expect(catalog.all()).toHaveLength(MODEL_REGISTRY.length + pluginModels);
  });

  it('leaves the catalogue unchanged when seeded again', () => {
    seed();
    const again = seed();
    expect(again.map((result) => result.inserted + result.updated + result.deleted)).toStrictEqual(
      again.map(() => 0),
    );
  });

  it('gives the devices of the home their own models', () => {
    seed();
    expect(modelFor(device('kingsmith.treadmill.ksg15', 'kingsmith', 'treadmill'))).toBe(
      'dev.treadmill.kingsmith-g15',
    );
    expect(modelFor(device('xiaomi.scales.400pgj', 'xiaomi', 'scale'))).toBe(
      'dev.scale.xiaomi-s400',
    );
    expect(modelFor(device('xiaomi.vacuum.pv11gl', 'xiaomi', 'vacuum'))).toBe(
      'dev.vacuum.xiaomi-pv11gl',
    );
    expect(modelFor(device('lumi.gateway.mgl001', 'lumi', 'gateway'))).toBe(
      'dev.gateway.xiaomi-hub-2',
    );
    expect(modelFor(device('LS49CG954SEXXT', 'Samsung Electronics', 'television'))).toBe(
      'dev.monitor.samsung-g9-oled-49',
    );
    expect(modelFor(device('S06ProWB3S新界面', 'Tuya', 'ir_blaster'))).toBe('dev.ir.tuya-s06-pro');
    expect(
      modelFor(
        device('TP1X_DA-KS-MICROWAVE-01041|40475341|5004', 'Samsung Electronics', 'microwave'),
      ),
    ).toBe('dev.microwave.samsung');
    expect(modelFor(device('Brother DCP-T430W', 'Brother', 'printer'))).not.toBeNull();
  });

  it('falls back to the family default model for an unknown device', () => {
    seed();
    expect(modelFor(device('acme.treadmill.x1', 'Acme', 'treadmill'))).toBe(
      'dev.treadmill.generic',
    );
  });
});
