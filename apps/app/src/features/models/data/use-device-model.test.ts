import { createHash } from 'node:crypto';
import {
  createModelCatalog,
  createOverrideIndex,
  type ModelCatalogRow,
  type ModelOverrideRow,
  type RowChange,
} from '@smarteverything/domain';
import { createElement, act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callBytes:
    vi.fn<(endpoint: unknown, input: { params: { sha256: string } }) => Promise<Uint8Array>>(),
  disk: new Map<string, Uint8Array>(),
}));

vi.mock('../../../api/transport', () => ({
  api: (): { callBytes: typeof mocks.callBytes } => ({ callBytes: mocks.callBytes }),
}));

vi.mock('./asset-cache', () => ({
  assetCache: {
    read: (hash: string): Promise<Uint8Array | null> =>
      Promise.resolve(mocks.disk.get(hash) ?? null),
    write: (hash: string, bytes: Uint8Array): Promise<void> => {
      mocks.disk.set(hash, bytes);
      return Promise.resolve();
    },
    prune: (): Promise<number> => Promise.resolve(0),
  },
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: (_algorithm: string, bytes: Uint8Array): Promise<ArrayBuffer> =>
    Promise.resolve(Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer),
}));

const { deviceFixture } = await import('../../../store/device-fixture');
const { CommandLedger } = await import('../../../store/command-ledger');
const { EntityStore } = await import('../../../store/entity-store');
const { StoreContext } = await import('../../../store/store-runtime');
const { familySubjectOf, modelSubjectOf, resolvedModelOf, useDeviceModel, useFamilyModel } =
  await import('./use-device-model');
type DeviceModel = ReturnType<typeof useDeviceModel>;

function specText(id: string): string {
  return JSON.stringify({
    schema: 1,
    id,
    version: '1.0.0',
    title: id,
    category: 'light',
    footprint: { width: 0.06, depth: 0.06, height: 0.11 },
    framing: {
      tile: { yaw: 0, pitch: 0, fov: 30, padding: 0.1 },
      card: { yaw: 0, pitch: 0, fov: 30, padding: 0.1 },
      hero: { yaw: 0, pitch: 0, fov: 30, padding: 0.1 },
    },
    materials: { body: { finish: 'matte-white' } },
    parts: [
      {
        id: 'base',
        geometry: { type: 'cylinder', height: 0.03, topRadius: 0.02, bottomRadius: 0.015 },
        material: 'body',
      },
    ],
  });
}

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const NO_MATCH = {
  exact: [],
  prefix: [],
  normalised: [],
  product: [],
  hardwareModel: [],
  families: [],
};

function row(id: string, patch: Partial<ModelCatalogRow> = {}): ModelCatalogRow {
  return {
    id,
    version: '1.0.0',
    owner: 'builtin',
    title: id,
    category: 'light',
    match: NO_MATCH,
    brands: [],
    aliases: [],
    extras: [],
    spec_sha256: sha(specText(id)),
    ...patch,
  };
}

function override(patch: Partial<ModelOverrideRow>): ModelOverrideRow {
  return {
    scope: 'device',
    target: 'dev-1',
    model_id: null,
    asset_hash: null,
    finish: null,
    params: {},
    set_by: 'me',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...patch,
  };
}

const LIGHT = deviceFixture(1, { manufacturer: 'Wiz', model: 'A60 | RGB v1.2.3' });

const BULB = row('dev.light.wiz-a60', {
  match: { ...NO_MATCH, normalised: ['a60'] },
  brands: ['Wiz'],
});

const FAMILY_LIGHT = row('dev.light.generic', { match: { ...NO_MATCH, families: ['light'] } });

const ROBOT = row('dev.vacuum.robot', {
  match: { ...NO_MATCH, exact: ['robot.1'] },
  extras: [{ role: 'dock', modelId: 'dev.vacuum.station' }],
});

const STATION = row('dev.vacuum.station');

function resolved(
  catalogRows: readonly ModelCatalogRow[],
  overrideRows: readonly ModelOverrideRow[] = [],
  device = LIGHT,
): ReturnType<typeof resolvedModelOf> {
  return resolvedModelOf(
    modelSubjectOf(device),
    createModelCatalog(catalogRows),
    createOverrideIndex(overrideRows),
  );
}

describe('the subject a device or family is resolved as', () => {
  it('carries the make, model string, family and the hardware identifiers of the device', () => {
    const phone = deviceFixture(1, {
      manufacturer: 'Samsung',
      model: 'smarteverything.android',
      details: { hardwareModel: 'SM-F966B', product: '' },
    });
    expect(modelSubjectOf(phone)).toMatchObject({
      id: phone.id,
      brand: 'Samsung',
      model: 'smarteverything.android',
      hardwareModel: 'SM-F966B',
    });
    expect(modelSubjectOf(phone).product).toBeUndefined();
  });

  it('is only a family for a family view', () => {
    expect(familySubjectOf('fan')).toStrictEqual({ id: '', brand: '', model: '', family: 'fan' });
  });
});

describe('resolving the model of a device from the synced tables', () => {
  it('picks the provided model that matches the make and model string and names its spec file', () => {
    const model = resolved([BULB, FAMILY_LIGHT]);
    expect(model.resolution.source).toBe('plugin-identity');
    expect(model.resolution.main).toStrictEqual({ kind: 'catalogue', modelId: BULB.id });
    expect(model.specHash).toBe(BULB.spec_sha256);
  });

  it('falls back to the family model, and to no model when nothing matches', () => {
    expect(
      resolved([FAMILY_LIGHT], [], deviceFixture(1, { manufacturer: 'Other' })).resolution.source,
    ).toBe('plugin-family');
    const flat = resolved([BULB]);
    const none = resolved([], []);
    expect(none.resolution.source).toBe('none');
    expect(none.specHash).toBeNull();
    expect(flat.resolution.candidates).toStrictEqual([BULB.id]);
  });

  it('lets the override of the device win with its finish and parameters', () => {
    const model = resolved(
      [BULB, FAMILY_LIGHT],
      [
        override({
          target: LIGHT.id,
          model_id: FAMILY_LIGHT.id,
          finish: 'brass',
          params: { width: 2 },
        }),
      ],
    );
    expect(model.resolution).toMatchObject({
      source: 'device-override',
      finish: 'brass',
      params: { width: 2 },
    });
    expect(model.specHash).toBe(FAMILY_LIGHT.spec_sha256);
  });

  it('uses an uploaded file by its own hash', () => {
    const hash = 'e'.repeat(64);
    const model = resolved([BULB], [override({ target: LIGHT.id, asset_hash: hash })]);
    expect(model.resolution.main).toStrictEqual({ kind: 'asset', hash });
    expect(model.specHash).toBe(hash);
  });

  it('applies a family override to every device of the family', () => {
    const model = resolved(
      [BULB, FAMILY_LIGHT],
      [override({ scope: 'family', target: 'light', model_id: FAMILY_LIGHT.id })],
    );
    expect(model.resolution.source).toBe('family-override');
  });

  it('returns the dock of a robot as an extra with its own spec file', () => {
    const robot = deviceFixture(1, { manufacturer: 'Xiaomi', model: 'robot.1' });
    const model = resolved([ROBOT, STATION], [], robot);
    expect(model.extras).toStrictEqual([
      { role: 'dock', modelId: STATION.id, specHash: STATION.spec_sha256 },
    ]);
  });

  it('keeps a model the catalogue lists without a file as an unfetchable hash', () => {
    const model = resolved([
      row('dev.light.wiz-a60', { match: BULB.match, brands: ['Wiz'], spec_sha256: null }),
    ]);
    expect(model.resolution.main).not.toBeNull();
    expect(model.specHash).toBeNull();
  });

  it('resolves a family on its own without a device', () => {
    const model = resolvedModelOf(
      familySubjectOf('light'),
      createModelCatalog([BULB, FAMILY_LIGHT]),
      createOverrideIndex([]),
    );
    expect(model.resolution.main).toStrictEqual({ kind: 'catalogue', modelId: FAMILY_LIGHT.id });
  });
});

function changeFor(record: ModelCatalogRow): RowChange {
  return { type: 'change', table: 'model_catalog', operation: 'INSERT', record, oldRecord: null };
}

function overrideChange(record: ModelOverrideRow): RowChange {
  return { type: 'change', table: 'model_overrides', operation: 'INSERT', record, oldRecord: null };
}

let root: Root | null = null;

async function until(check: () => void): Promise<void> {
  await vi.waitFor(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    check();
  });
}

function mount(
  store: InstanceType<typeof EntityStore>,
  read: () => DeviceModel,
): () => DeviceModel | null {
  let latest: DeviceModel | null = null;
  function Probe(): ReactNode {
    latest = read();
    return null;
  }
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(
      createElement(
        StoreContext.Provider,
        { value: { store, ledger: new CommandLedger(store) } },
        createElement(Probe),
      ),
    );
  });
  return () => latest;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  mocks.disk.clear();
  mocks.callBytes.mockImplementation((_endpoint, input) => {
    const known = [BULB, FAMILY_LIGHT, ROBOT, STATION].find(
      (candidate) => candidate.spec_sha256 === input.params.sha256,
    );
    return known === undefined
      ? Promise.reject(new Error('not found'))
      : Promise.resolve(new TextEncoder().encode(specText(known.id)));
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('the device model hooks', () => {
  it('loads the spec of the matched model, then follows an override set on the hub', async () => {
    const store = new EntityStore();
    store.apply(
      [changeFor(BULB), changeFor(FAMILY_LIGHT)].map((change, at) => ({ ...change, seq: at + 1 })),
    );
    const latest = mount(store, () => useDeviceModel(LIGHT));
    expect(latest()?.source).toBe('plugin-identity');
    await until(() => {
      expect(latest()?.spec.status).toBe('ready');
    });
    const first = latest()?.spec;
    expect(first?.status === 'ready' && first.value.id).toBe(BULB.id);
    await act(async () => {
      store.apply([
        {
          ...overrideChange(
            override({ target: LIGHT.id, model_id: FAMILY_LIGHT.id, finish: 'brass' }),
          ),
          seq: 9,
        },
      ]);
      await Promise.resolve();
    });
    await until(() => {
      expect(latest()?.spec.status === 'ready' && latest()?.finish).toBe('brass');
    });
    expect(latest()?.source).toBe('device-override');
    const next = latest()?.spec;
    expect(next?.status === 'ready' && next.value.id).toBe(FAMILY_LIGHT.id);
  });

  it('is idle for a device with no model and reports a listed model with no file as failed', () => {
    const store = new EntityStore();
    const none = mount(store, () => useDeviceModel(LIGHT));
    expect(none()?.source).toBe('none');
    expect(none()?.spec.status).toBe('idle');
    act(() => {
      root?.unmount();
    });
    store.apply([
      {
        ...changeFor(row(BULB.id, { match: BULB.match, brands: ['Wiz'], spec_sha256: null })),
        seq: 1,
      },
    ]);
    const missing = mount(store, () => useDeviceModel(LIGHT));
    expect(missing()?.spec).toMatchObject({ status: 'failed' });
  });

  it('resolves a family with the family hook and loads the dock of a robot beside it', async () => {
    const store = new EntityStore();
    store.apply([{ ...changeFor(FAMILY_LIGHT), seq: 1 }]);
    const family = mount(store, () => useFamilyModel('light'));
    await until(() => {
      expect(family()?.spec.status).toBe('ready');
    });
    expect(family()?.source).toBe('plugin-family');
    act(() => {
      root?.unmount();
    });
    const robotStore = new EntityStore();
    robotStore.apply([ROBOT, STATION].map((record, at) => ({ ...changeFor(record), seq: at + 1 })));
    const robot = mount(robotStore, () =>
      useDeviceModel(deviceFixture(1, { manufacturer: 'Xiaomi', model: 'robot.1' })),
    );
    await until(() => {
      expect(robot()?.extras[0]?.spec.status).toBe('ready');
    });
    expect(robot()?.extras.map((extra) => extra.role)).toStrictEqual(['dock']);
  });
});
