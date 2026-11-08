import {
  createModelCatalog,
  createOverrideIndex,
  type ModelCatalogRow,
  type ModelOverrideRow,
  type ModelSpec,
  type TableRow,
} from '@smarteverything/domain';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelAssetState } from '../models';

interface Seen {
  spec: unknown;
  live: Readonly<Record<string, unknown>>[];
  hero: Readonly<Record<string, unknown>>[];
  stills: Readonly<Record<string, unknown>>[];
  cameras: number;
}

const seen = vi.hoisted((): Seen => ({ spec: null, live: [], hero: [], stills: [], cameras: 0 }));

vi.mock('../models/data/use-model-asset', () => ({
  useModelSpecs: (): readonly unknown[] => [seen.spec],
}));

vi.mock('../models/live/live-view', () => ({
  LiveModelView: (props: Record<string, unknown> & { still: ReactNode }): ReactNode => {
    seen.live.push(props);
    return props.still;
  },
}));

vi.mock('../models/live/hero-view', () => ({
  HeroModelView: (props: Record<string, unknown> & { still: ReactNode }): ReactNode => {
    seen.hero.push(props);
    return props.still;
  },
}));

vi.mock('../models/visual/model-visual', () => ({
  ModelVisual: (props: Record<string, unknown>): ReactNode => {
    seen.stills.push(props);
    return null;
  },
}));

vi.mock('./visuals/camera-media', () => ({
  CameraMedia: (): ReactNode => {
    seen.cameras += 1;
    return null;
  },
}));

vi.mock(
  '../../queries/use-screen-query',
  async () => (await import('../device-list/idle-queries')).idleQueries,
);

const mocks = await import('../device-list/cell-mocks');
const { useCellEnvironment } = await import('../device-list/cell-budget');
const { cellNodes, deviceFixture, stateFixture, EntityStore, CommandLedger, StoreProvider } = mocks;
const { DeviceVisual, FamilyVisual } = await import('./device-visual');
const { WidgetModels, capabilitySignals, liveKeyOf, modelSourceOf, planOf } =
  await import('./model-frame');
const { WidgetModelsContext } = await import('./widget-models-context');
const { familySubjectOf, modelSubjectOf } = await import('../models/data/use-device-model');
const { fanSpec } = await import('../models/visual/visual-fixture');
const { makeTable } = await import('../../store/state');
const { treeOf } = await import('../device-list/cell-tree');

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
    spec_sha256: `hash-${id}`,
    ...patch,
  };
}

function familyRow(family: 'light' | 'camera'): ModelCatalogRow {
  return row(`dev.${family}.generic`, { match: { ...NO_MATCH, families: [family] } });
}

const LIGHT_ROW = familyRow('light');
const CAMERA_ROW = familyRow('camera');

const NO_ASSETS = stateFixture([], {}).tables.model_assets;

const GLB_HASH = 'a'.repeat(64);

const GLB: TableRow<'model_assets'> = {
  sha256: GLB_HASH,
  kind: 'glb',
  size: 10,
  owner: 'user:me',
  created: '2026-10-01T00:00:00.000Z',
};

function models(
  rows: readonly ModelCatalogRow[],
  overrides: readonly ModelOverrideRow[] = [],
): InstanceType<typeof WidgetModels> {
  return new WidgetModels(createModelCatalog(rows), createOverrideIndex(overrides), NO_ASSETS);
}

const SPEC: ModelSpec = fanSpec();

const READY: ModelAssetState<ModelSpec> = { status: 'ready', value: SPEC };

const LIGHT = deviceFixture(0, { kind: 'light', model: 'test.light', room_id: 'room-0' });

const CAMERA = deviceFixture(1, { kind: 'camera', model: 'test.camera', room_id: 'room-0' });

function container(): object {
  return {
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): undefined => undefined,
  };
}

const PRINTER = deviceFixture(2, { kind: 'printer', model: 'test.printer', room_id: 'room-0' });

function mount(element: ReactNode, scope: InstanceType<typeof WidgetModels> | null): () => string {
  const store = new EntityStore();
  store.update(() => ({ ...stateFixture([LIGHT, CAMERA, PRINTER], {}), loaded: true }));
  const host = container();
  const root = createRoot(host);
  act(() => {
    const scoped = createElement(
      mocks.PaletteContext,
      { value: mocks.PALETTE },
      createElement(
        mocks.LightingContext,
        { value: mocks.LIGHTING.light },
        createElement(WidgetModelsContext, { value: scope }, element),
      ),
    );
    root.render(
      createElement((): ReactNode =>
        StoreProvider({ runtime: { store, ledger: new CommandLedger(store) }, children: scoped }),
      ),
    );
  });
  return (): string => {
    const tree = treeOf(host);
    act(() => {
      root.unmount();
    });
    return tree;
  };
}

beforeEach(() => {
  seen.spec = { status: 'loading' };
  seen.live = [];
  seen.hero = [];
  seen.stills = [];
  seen.cameras = 0;
  cellNodes.count = 0;
});

describe('which model a widget draws', () => {
  it('plans the family model with its spec file, and nothing when no model matches', () => {
    const catalog = createModelCatalog([LIGHT_ROW]);
    const plan = planOf(modelSubjectOf(LIGHT), catalog, createOverrideIndex([]), NO_ASSETS);
    expect(plan).toStrictEqual({ specHash: LIGHT_ROW.spec_sha256, finish: null, params: {} });
    expect(planOf(familySubjectOf('fan'), catalog, createOverrideIndex([]), NO_ASSETS)).toBeNull();
  });

  it('plans no widget model for an uploaded GLB or image override', () => {
    const override: ModelOverrideRow = {
      scope: 'device',
      target: LIGHT.id,
      model_id: null,
      asset_hash: GLB_HASH,
      finish: null,
      params: {},
      set_by: 'me',
      updated_at: '2026-10-01T00:00:00.000Z',
    };
    const assets = makeTable({ [GLB_HASH]: GLB }, [GLB_HASH], 1);
    const catalog = createModelCatalog([LIGHT_ROW]);
    const subject = modelSubjectOf(LIGHT);
    expect(planOf(subject, catalog, createOverrideIndex([override]), assets)).toBeNull();
  });

  it('resolves a device once per row and a family view to the family default', () => {
    const scope = models([LIGHT_ROW]);
    const plan = scope.planFor(LIGHT, 'light');
    expect(scope.planFor(LIGHT, 'light')).toBe(plan);
    expect(scope.planFor(null, 'light')?.specHash).toBe(LIGHT_ROW.spec_sha256);
    expect(scope.planFor(null, 'fan')).toBeNull();
  });

  it('draws only a loaded spec and keeps a finish the spec does not know off the model', () => {
    const plan = { specHash: 'hash', finish: 'brass', params: { width: 2 } };
    expect(modelSourceOf(plan, { status: 'loading' })).toBeNull();
    const source = modelSourceOf(plan, READY);
    expect(source).toMatchObject({
      spec: SPEC,
      specHash: 'hash',
      finish: null,
      params: { width: 2 },
    });
    expect(source === null ? null : liveKeyOf(source, 'card')).toStrictEqual({
      specHash: 'hash',
      lod: 1,
      finish: null,
      params: { width: 2 },
    });
  });

  it('reads plain capability values for the hero readout', () => {
    const at = '2026-10-01T00:00:00.000Z';
    expect(
      capabilitySignals({
        power: { value: true, observedAt: at },
        mode: { value: 'auto', observedAt: at },
        colour: { value: { r: 1 }, observedAt: at },
      }),
    ).toStrictEqual({ power: true, mode: 'auto' });
  });
});

describe('the device visual', () => {
  useCellEnvironment();

  it('draws a plain empty tile of the same size when no model scope or model exists', () => {
    const empty = 'View aria-hidden=true className="shrink-0 size-24" pointerEvents="none"';
    expect(mount(createElement(DeviceVisual, { device: LIGHT, size: 'card' }), null)()).toBe(empty);
    expect(
      mount(createElement(DeviceVisual, { device: PRINTER, size: 'card' }), models([]))(),
    ).toBe(empty);
    expect(seen.live).toHaveLength(0);
  });

  it('keeps an empty tile while the spec loads, then the live view over the still', () => {
    const scope = models([LIGHT_ROW]);
    const loading = mount(createElement(DeviceVisual, { device: LIGHT, size: 'card' }), scope)();
    expect(loading).not.toContain('Svg');
    expect(seen.live).toHaveLength(0);
    seen.spec = READY;
    mount(createElement(DeviceVisual, { device: LIGHT, size: 'card' }), scope)();
    const live = seen.live.at(-1);
    expect(live).toMatchObject({ view: 'card', px: 96, spec: SPEC });
    expect(live?.['model']).toStrictEqual({
      specHash: LIGHT_ROW.spec_sha256,
      lod: 1,
      finish: null,
      params: {},
    });
    expect(live?.['signals']).toMatchObject({ online: LIGHT.online });
    expect(seen.stills.at(-1)).toMatchObject({ view: 'card', px: 96 });
  });

  it('mounts the interactive hero only where the device page asks for it', () => {
    seen.spec = READY;
    const scope = models([LIGHT_ROW]);
    mount(
      createElement(DeviceVisual, { device: LIGHT, size: 'hero', px: 220, interactive: true }),
      scope,
    )();
    expect(seen.hero.at(-1)).toMatchObject({ title: LIGHT.label, px: 220 });
    expect(seen.live).toHaveLength(0);
  });

  it('draws a hero-size widget in a card as the widget model without inspect', () => {
    seen.spec = READY;
    const scope = models([LIGHT_ROW]);
    mount(createElement(DeviceVisual, { device: LIGHT, size: 'hero', px: 220 }), scope)();
    expect(seen.hero).toHaveLength(0);
    const live = seen.live.at(-1);
    expect(live).toMatchObject({ view: 'hero', px: 220 });
    expect(live?.['liveWhen']).toBeUndefined();
    expect(live?.['inspect']).toBeUndefined();
  });

  it('draws a family hero as the widget model', () => {
    seen.spec = READY;
    const scope = models([LIGHT_ROW]);
    mount(
      createElement(FamilyVisual, { family: 'light', state: stillState(), size: 'hero' }),
      scope,
    )();
    expect(seen.live.at(-1)).toMatchObject({ view: 'hero' });
  });

  it('draws the printer model at card and tile size once a printer model resolves', () => {
    seen.spec = READY;
    const printerRow = row('dev.printer.laser', {
      category: 'printer',
      match: { ...NO_MATCH, families: ['printer'] },
    });
    const scope = models([printerRow]);
    mount(createElement(DeviceVisual, { device: PRINTER, size: 'card' }), scope)();
    mount(createElement(DeviceVisual, { device: PRINTER, size: 'tile' }), scope)();
    expect(seen.live.map((live) => live['view'])).toEqual(['card', 'tile']);
    expect(seen.live.map((live) => live['model'])).toEqual([
      { specHash: printerRow.spec_sha256, lod: 1, finish: null, params: {} },
      { specHash: printerRow.spec_sha256, lod: 0, finish: null, params: {} },
    ]);
    expect(seen.stills.map((still) => still['view'])).toEqual(['card', 'tile']);
    mount(createElement(DeviceVisual, { device: PRINTER, size: 'card' }), models([]))();
    expect(seen.live).toHaveLength(2);
  });

  it('draws a device that owns its state at the size its card asks for', () => {
    seen.spec = READY;
    const printerRow = row('dev.printer.laser', {
      category: 'printer',
      match: { ...NO_MATCH, families: ['printer'] },
    });
    mount(
      createElement(DeviceVisual, { device: PRINTER, size: 'card', px: 168 }),
      models([printerRow]),
    )();
    expect(seen.live.at(-1)).toMatchObject({ view: 'card', px: 168 });
  });

  it('keeps the camera snapshot while online and shows its model while offline', () => {
    seen.spec = READY;
    const scope = models([CAMERA_ROW]);
    mount(createElement(DeviceVisual, { device: CAMERA, size: 'card' }), scope)();
    expect(seen.cameras).toBe(1);
    expect(seen.live).toHaveLength(0);
    const offline = { ...CAMERA, online: false };
    mount(createElement(DeviceVisual, { device: offline, size: 'card' }), scope)();
    expect(seen.cameras).toBe(1);
    expect(seen.live).toHaveLength(1);
    mount(createElement(DeviceVisual, { device: offline, size: 'card' }), models([]))();
    expect(seen.cameras).toBe(2);
  });
});

function stillState(): Parameters<typeof FamilyVisual>[0]['state'] {
  return mocks.visualStateOf({ ...LIGHT, online: true }, {});
}
