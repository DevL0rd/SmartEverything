import {
  createModelCatalog,
  createOverrideIndex,
  type DeviceCapability,
  type ModelCatalogRow,
  type ModelSpec,
} from '@smarteverything/domain';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { ModelAssetState } from '../../models';

const seen = vi.hoisted((): { spec: unknown } => ({ spec: null }));

vi.mock('../../models/data/use-model-asset', () => ({
  useModelSpecs: (): readonly unknown[] => [seen.spec],
}));

vi.mock('../../models/live/live-view', () => ({
  LiveModelView: (props: { readonly still: ReactNode }): ReactNode => props.still,
}));

vi.mock('../../models/visual/model-visual', () => ({ ModelVisual: (): ReactNode => null }));

vi.mock(
  '../../../queries/use-screen-query',
  async () => (await import('../../device-list/idle-queries')).idleQueries,
);

const mocks = await import('../../device-list/cell-mocks');
const { useCellEnvironment } = await import('../../device-list/cell-budget');
const { treeOf } = await import('../../device-list/cell-tree');
const { deviceFixture, stateFixture, EntityStore, CommandLedger, StoreProvider } = mocks;
const { DeviceVisual } = await import('../../device-visuals');
const { WidgetModels } = await import('../../device-visuals/model-frame');
const { WidgetModelsContext } = await import('../../device-visuals/widget-models-context');
const { DeviceStage } = await import('./device-stage');
const { fanSpec } = await import('../../models/visual/visual-fixture');

const LIGHT_ROW: ModelCatalogRow = {
  id: 'dev.light.generic',
  version: '1.0.0',
  owner: 'builtin',
  title: 'Light',
  category: 'light',
  match: {
    exact: [],
    prefix: [],
    normalised: [],
    product: [],
    hardwareModel: [],
    families: ['light'],
  },
  brands: [],
  aliases: [],
  extras: [],
  spec_sha256: 'hash-light',
};

const READY: ModelAssetState<ModelSpec> = { status: 'ready', value: fanSpec() };

const CAPABILITIES: DeviceCapability[] = [
  { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
  {
    key: 'brightness',
    label: 'Brightness',
    access: 'read_write',
    value: { kind: 'number', min: 0, max: 100, step: 1, unit: '%' },
  },
];

const LIGHT = deviceFixture(0, {
  kind: 'light',
  model: 'test.light',
  room_id: 'room-0',
  capabilities: CAPABILITIES,
});

function container(): object {
  return {
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): undefined => undefined,
  };
}

function rendered(element: ReactNode): string {
  const store = new EntityStore();
  const state = { ...stateFixture([LIGHT], {}), loaded: true };
  store.update(() => state);
  const scope = new WidgetModels(
    createModelCatalog([LIGHT_ROW]),
    createOverrideIndex([]),
    state.tables.model_assets,
  );
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
  const tree = treeOf(host);
  act(() => {
    root.unmount();
  });
  return tree;
}

describe('the device page hero', () => {
  useCellEnvironment();

  it('offers Inspect on a dimmer hero beside its level surface, and never on a grid widget', () => {
    seen.spec = READY;
    const page = rendered(createElement(DeviceStage, { device: LIGHT }));
    expect(page).toContain('accessibilityLabel="Device 0 Brightness"');
    expect(page).toContain('accessibilityLabel="3D model of Device 0"');
    expect(page).toContain('Inspect');
    const widget = rendered(createElement(DeviceVisual, { device: LIGHT, size: 'hero', px: 220 }));
    expect(widget).not.toContain('3D model of');
    expect(widget).not.toContain('Inspect');
  });
});
