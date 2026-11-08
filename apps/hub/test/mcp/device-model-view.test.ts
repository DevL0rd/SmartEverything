import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deviceDetails } from '../../src/extensions/mcp/tools/devices';
import { placedDevice } from '../../src/extensions/mcp/tools/targets';
import { entryFromSpec } from '../../src/models/contributions';
import { ModelCatalogService } from '../../src/models/catalog-service';
import { OWNER } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';
import { addDevice } from '../models/route-fixtures';
import { specOf } from '../models/model-fixtures';

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function register(exact: string[]): void {
  new ModelCatalogService({
    assets: opened.store.modelAssets,
    catalog: opened.store.modelCatalog,
  }).replace({
    owner: 'builtin',
    entries: [entryFromSpec(specOf('dev.fan.wiz', '1.0.0', {}), { match: { exact } })],
  });
}

function modelOf(id: string): Record<string, unknown> {
  const read = deviceDetails(opened.store, null, OWNER, placedDevice(opened.store, null, id));
  const device = Object.fromEntries(Object.entries(read))['device'];
  if (typeof device !== 'object' || device === null) throw new Error('No device.');
  const model: unknown = Object.fromEntries(Object.entries(device))['model'];
  if (typeof model !== 'object' || model === null) throw new Error('No model field.');
  return Object.fromEntries(Object.entries(model));
}

describe('the device read view model field', () => {
  it('reports no source when nothing resolves', () => {
    const device = addDevice(opened, { model: 'wiz.fan' });
    expect(modelOf(device.id)).toEqual({
      id: null,
      asset_hash: null,
      source: 'none',
      finish: null,
      extras: [],
    });
  });

  it('reports a catalogue model matched by the device identity', () => {
    register(['wiz.fan']);
    const device = addDevice(opened, { model: 'wiz.fan' });
    expect(modelOf(device.id)).toMatchObject({ id: 'dev.fan.wiz', extras: [] });
  });

  it('follows a household override of the device', () => {
    register(['other.fan']);
    const device = addDevice(opened, { model: 'wiz.fan' });
    opened.store.modelOverrides.set({
      scope: 'device',
      target: device.id,
      modelId: 'dev.fan.wiz',
      finish: 'dark',
      setBy: 'owner',
    });
    expect(modelOf(device.id)).toMatchObject({ id: 'dev.fan.wiz', finish: 'dark' });
  });
});
