import type { IncomingHttpHeaders } from 'node:http';
import { API_ENDPOINTS, modelIdentityKey, type DeviceModels } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '../../src/server/auth';
import { modelViewOf } from '../../src/server/handlers/models';
import { captureLogs, testLogger } from '../support/logs';
import { jsonBytes, specOf } from './model-fixtures';
import {
  DARK_FINISHES,
  addDevice,
  builtinEntry,
  harness,
  pluginEntry,
  type Harness,
} from './route-fixtures';

interface Raw {
  readonly params?: Record<string, string>;
  readonly query?: Record<string, string>;
  readonly body?: unknown;
}

let h: Harness;

beforeEach(async () => {
  captureLogs();
  h = await harness();
  h.service.replace({ owner: 'builtin', entries: [builtinEntry('dev.fan.generic')] });
  h.service.replace({
    owner: 'plugin:wiz',
    entries: [
      pluginEntry('dev.fan.wiz', { extra: DARK_FINISHES }),
      pluginEntry('dev.light.wiz', {
        match: { exact: ['wiz.bulb'] },
        extra: { meta: { names: { display: 'Bulb' }, aliases: ['dev.bulb.old'] } },
      }),
    ],
  });
});

afterEach(async () => {
  await h.close();
});

function raw({ params = {}, query = {}, body }: Raw): {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  remote: string;
  headers: IncomingHttpHeaders;
} {
  return { params, query, body, remote: '127.0.0.1', headers: {} };
}

async function read(deviceId: string): Promise<DeviceModels> {
  const reply = await h.routes.readDeviceModels.run(
    h.member,
    raw({ params: { deviceId } }),
    testLogger(),
  );
  return API_ENDPOINTS.readDeviceModels.response.parse(reply);
}

function put(deviceId: string, body: unknown, caller: Caller = h.member): Promise<unknown> {
  return h.routes.setDeviceModelOverride.run(
    caller,
    raw({ params: { deviceId }, body }),
    testLogger(),
  );
}

function remove(deviceId: string, scope?: string): Promise<unknown> {
  return h.routes.resetDeviceModelOverride.run(
    h.member,
    raw({ params: { deviceId }, query: scope === undefined ? {} : { scope } }),
    testLogger(),
  );
}

describe('the endpoint contract', () => {
  it('registers the model endpoints with member access and an owner upload', () => {
    const access = Object.fromEntries(
      Object.entries(API_ENDPOINTS)
        .filter(([, shape]) =>
          /^\/api\/(models|model-assets|devices\/:deviceId\/model)/u.test(shape.path),
        )
        .map(([name, shape]) => [name, `${shape.method} ${shape.path} ${shape.access}`]),
    );
    expect(access).toStrictEqual({
      listModels: 'GET /api/models member',
      readDeviceModels: 'GET /api/devices/:deviceId/models member',
      setDeviceModelOverride: 'PUT /api/devices/:deviceId/model-override member',
      resetDeviceModelOverride: 'DELETE /api/devices/:deviceId/model-override member',
      uploadModelAsset: 'POST /api/model-assets owner',
      readModelAsset: 'GET /api/model-assets/:sha256 member',
    });
  });

  it('keeps the bound routes to the four JSON endpoints', () => {
    expect(Object.keys(h.routes).sort()).toStrictEqual([
      'listModels',
      'readDeviceModels',
      'resetDeviceModelOverride',
      'setDeviceModelOverride',
    ]);
  });
});

describe('listing the catalogue', () => {
  async function ids(query: Record<string, string>): Promise<string[]> {
    const reply = API_ENDPOINTS.listModels.response.parse(
      await h.routes.listModels.run(h.member, raw({ query }), testLogger()),
    );
    return reply.models.map((model) => model.id);
  }

  it('lists everything for a member and filters by family, category and words', async () => {
    expect(await ids({})).toStrictEqual(['dev.fan.generic', 'dev.fan.wiz', 'dev.light.wiz']);
    expect(await ids({ family: 'fan' })).toStrictEqual(['dev.fan.generic']);
    expect(await ids({ category: 'CLIMATE' })).toStrictEqual([
      'dev.fan.generic',
      'dev.fan.wiz',
      'dev.light.wiz',
    ]);
    expect(await ids({ category: 'lighting' })).toStrictEqual([]);
    expect(await ids({ q: 'wiz bulb' })).toStrictEqual(['dev.light.wiz']);
    expect(await ids({ q: 'dev.bulb.old' })).toStrictEqual(['dev.light.wiz']);
    expect(await ids({ q: 'nothing like this' })).toStrictEqual([]);
  });

  it('rejects a family that does not exist', async () => {
    await expect(
      h.routes.listModels.run(h.member, raw({ query: { family: 'toaster' } }), testLogger()),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});

describe('reading the models of a device', () => {
  it('reports the provided model, its source, candidates and finishes', async () => {
    const fan = addDevice(h.test, { model: 'wiz.fan' });
    const view = await read(fan.id);
    expect(view.model).toMatchObject({
      id: 'dev.fan.wiz',
      asset_hash: null,
      source: 'plugin-identity',
      finish: null,
    });
    expect(view.candidates.map((candidate) => candidate.id)).toStrictEqual([
      'dev.fan.wiz',
      'dev.fan.generic',
    ]);
    expect(view.finishes).toStrictEqual(['dark']);
    expect(view.default_finish).toBe('dark');
    expect(view.overrides).toStrictEqual([]);
    expect(view.identity).toStrictEqual({
      brand: 'WiZ',
      model_string: 'wiz.fan',
      hardware_model: null,
    });
  });

  it('falls to the family model for a fan the plugin does not name', async () => {
    const fan = addDevice(h.test, { model: 'other.fan', manufacturer: 'Other' });
    expect((await read(fan.id)).model).toMatchObject({
      id: 'dev.fan.generic',
      source: 'plugin-family',
    });
  });

  it('answers not found for an unknown device', async () => {
    await expect(
      h.routes.readDeviceModels.run(
        h.member,
        raw({ params: { deviceId: '3f5f3c9e-5a2d-4c8e-9a53-2f1d3a9d0b11' } }),
        testLogger(),
      ),
    ).rejects.toMatchObject({ name: 'StoreNotFoundError', what: 'device' });
  });
});

describe('setting and resetting an override', () => {
  it('lets a member override one device, which wins over the provided model', async () => {
    const fan = addDevice(h.test, { model: 'wiz.fan' });
    const other = addDevice(h.test, { model: 'wiz.fan', externalId: 'second' });
    const row = await put(fan.id, { scope: 'device', model_id: 'dev.fan.generic' });
    expect(row).toMatchObject({
      scope: 'device',
      target: fan.id,
      model_id: 'dev.fan.generic',
      asset_hash: null,
      finish: null,
    });
    expect((await read(fan.id)).model).toMatchObject({
      id: 'dev.fan.generic',
      source: 'device-override',
    });
    expect((await read(other.id)).model).toMatchObject({
      id: 'dev.fan.wiz',
      source: 'plugin-identity',
    });
  });

  it('refuses a finish the chosen model does not have', async () => {
    const fan = addDevice(h.test, { model: 'wiz.fan' });
    await expect(
      put(fan.id, { scope: 'device', model_id: 'dev.fan.generic', finish: 'dark' }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      put(fan.id, { scope: 'device', model_id: 'dev.fan.wiz', finish: 'missing' }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(h.overrides.all()).toStrictEqual([]);
  });

  it('applies a device override and keeps the finish and params it was given', async () => {
    const fan = addDevice(h.test, { model: 'wiz.fan' });
    await put(fan.id, {
      scope: 'device',
      model_id: 'dev.fan.wiz',
      finish: 'dark',
      params: { blades: 5 },
    });
    const view = await read(fan.id);
    expect(view.model).toMatchObject({
      id: 'dev.fan.wiz',
      source: 'device-override',
      finish: 'dark',
    });
    expect(view.params).toStrictEqual({ blades: 5 });
    expect(view.overrides).toHaveLength(1);
  });

  it('applies an identity override to every device with the same make and model only', async () => {
    const first = addDevice(h.test, { model: 'wiz.fan', externalId: 'a' });
    const second = addDevice(h.test, { model: 'wiz.fan', externalId: 'b' });
    const different = addDevice(h.test, { model: 'wiz.fan.pro', externalId: 'c' });
    await put(first.id, { scope: 'identity', model_id: 'dev.fan.generic' });
    expect((await read(second.id)).model).toMatchObject({
      id: 'dev.fan.generic',
      source: 'identity-override',
    });
    expect((await read(different.id)).model.source).not.toBe('identity-override');
    expect(h.overrides.all()[0]?.target).toBe(
      modelIdentityKey({ brand: 'WiZ', modelString: 'wiz.fan' }),
    );
  });

  it('tells two phones that share a model string apart by hardware model', async () => {
    const fold = addDevice(h.test, {
      model: 'smarteverything.android',
      manufacturer: 'samsung',
      kind: 'sensor',
      externalId: 'fold',
      details: { hardwareModel: 'SM-F966B' },
    });
    const tablet = addDevice(h.test, {
      model: 'smarteverything.android',
      manufacturer: 'samsung',
      kind: 'sensor',
      externalId: 'tab',
      details: { hardwareModel: 'SM-X916B' },
    });
    await put(fold.id, { scope: 'identity', model_id: 'dev.fan.generic' });
    expect((await read(fold.id)).model.source).toBe('identity-override');
    expect((await read(tablet.id)).model.source).not.toBe('identity-override');
    expect((await read(fold.id)).identity.hardware_model).toBe('SM-F966B');
  });

  it('applies a family override and resets it by scope', async () => {
    const fan = addDevice(h.test, { model: 'other.fan', manufacturer: 'Other' });
    await put(fan.id, { scope: 'family', model_id: 'dev.fan.wiz' });
    expect((await read(fan.id)).model).toMatchObject({
      id: 'dev.fan.wiz',
      source: 'family-override',
    });
    expect(await remove(fan.id, 'family')).toStrictEqual({
      scope: 'family',
      target: 'fan',
      removed: true,
    });
    expect(await remove(fan.id, 'family')).toMatchObject({ removed: false });
    expect((await read(fan.id)).model.source).toBe('plugin-family');
  });

  it('resets the device scope by default and falls back to the provided model', async () => {
    const fan = addDevice(h.test, { model: 'wiz.fan' });
    await put(fan.id, { scope: 'device', model_id: 'dev.fan.generic' });
    expect(await remove(fan.id)).toMatchObject({ scope: 'device', target: fan.id, removed: true });
    expect((await read(fan.id)).model).toMatchObject({
      id: 'dev.fan.wiz',
      source: 'plugin-identity',
    });
  });

  it('records who set the override and replaces it on a second call', async () => {
    const fan = addDevice(h.test, { model: 'wiz.fan' });
    await put(fan.id, { scope: 'device', model_id: 'dev.fan.generic' });
    await put(fan.id, { scope: 'device', model_id: 'dev.fan.wiz' }, h.owner);
    const rows = h.overrides.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ model_id: 'dev.fan.wiz' });
    expect(rows[0]?.set_by).toBe(h.services.profileOf(h.owner));
  });

  it('refuses unknown models and files, and bodies that name both or neither', async () => {
    const fan = addDevice(h.test, { model: 'wiz.fan' });
    await expect(put(fan.id, { scope: 'device', model_id: 'dev.fan.nope' })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      put(fan.id, { scope: 'device', asset_hash: 'a'.repeat(64) }),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      put(fan.id, { scope: 'device', model_id: 'dev.fan.wiz', asset_hash: 'a'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(put(fan.id, { scope: 'device' })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    await expect(put(fan.id, { scope: 'room', model_id: 'dev.fan.wiz' })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(h.overrides.all()).toStrictEqual([]);
  });

  it('uses an uploaded spec as an override and reports it as an asset', async () => {
    const fan = addDevice(h.test, { model: 'wiz.fan' });
    const stored = h.service.storeUserSpec(
      'profile',
      jsonBytes(specOf('dev.fan.mine', '1.0.0', DARK_FINISHES)),
    );
    if (!stored.stored) throw new Error(stored.problem);
    await put(fan.id, { scope: 'device', asset_hash: stored.sha256, finish: 'dark' });
    const view = await read(fan.id);
    expect(view.model).toMatchObject({
      id: null,
      asset_hash: stored.sha256,
      source: 'device-override',
      finish: 'dark',
    });
    expect(view.finishes).toStrictEqual(['dark']);
  });
});

describe('the device model view', () => {
  it('names a catalogue model or an uploaded file, with extras', () => {
    const base = {
      source: 'kind-default',
      extras: [{ role: 'dock', modelId: 'dev.vacuum.station' }],
      candidates: [],
      issues: [],
    } as const;
    expect(
      modelViewOf({ ...base, main: { kind: 'catalogue', modelId: 'dev.fan.wiz' }, finish: 'dark' }),
    ).toStrictEqual({
      id: 'dev.fan.wiz',
      asset_hash: null,
      source: 'kind-default',
      finish: 'dark',
      extras: [{ role: 'dock', modelId: 'dev.vacuum.station' }],
    });
    expect(modelViewOf({ ...base, main: { kind: 'asset', hash: 'b'.repeat(64) } })).toMatchObject({
      id: null,
      asset_hash: 'b'.repeat(64),
      finish: null,
    });
    expect(modelViewOf({ ...base, source: 'none', main: null, extras: [] })).toMatchObject({
      id: null,
      asset_hash: null,
      source: 'none',
    });
  });
});
