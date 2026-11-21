import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_NODE_KINDS } from '@smarteverything/domain';
import { deviceFixture } from '../../../../store/device-fixture';
import type { Device } from '../../../../store/state';
import type * as Categories from './palette-categories';
import type { PaletteEntry } from './palette-categories';

interface World {
  devices: readonly Device[];
  readonly functions: readonly never[];
  shipped: number;
}

const world = vi.hoisted((): World => ({ devices: [], functions: [], shipped: 0 }));

vi.mock('../../hosts/editor-devices', () => ({
  useShownEditorDevices: (): readonly Device[] => world.devices,
}));
vi.mock('../../data/source', () => ({
  useAutomationsSource: (): { readonly kinds: typeof ALL_NODE_KINDS } => ({
    kinds: ALL_NODE_KINDS,
  }),
}));
vi.mock('../../data/use-catalog', () => ({
  useCatalog: (): { readonly functions: readonly never[] } => ({ functions: world.functions }),
}));
vi.mock('./palette-categories', async (original) => {
  const actual = await original<typeof Categories>();
  return {
    ...actual,
    shippedNodeEntries: (
      ...args: Parameters<typeof actual.shippedNodeEntries>
    ): ReturnType<typeof actual.shippedNodeEntries> => {
      world.shipped += 1;
      return actual.shippedNodeEntries(...args);
    },
  };
});

const { usePaletteEntries } = await import('./palette');

let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  world.devices = [deviceFixture(0)];
  world.shipped = 0;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

function mount(): () => readonly PaletteEntry[] {
  const seen: (readonly PaletteEntry[])[] = [];
  function Probe({ tick }: { readonly tick: number }): ReactNode {
    seen.push(usePaletteEntries());
    return tick < 0 ? tick : null;
  }
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  return () => {
    act(() => {
      created.render(createElement(Probe, { tick: seen.length }));
    });
    const latest = seen.at(-1);
    if (latest === undefined) throw new Error('the probe did not render');
    return latest;
  };
}

describe('palette entries', () => {
  it('builds the shipped steps once while the device list changes', () => {
    const render = mount();
    const before = render();
    world.devices = [deviceFixture(0, { name: 'Wrist' })];
    const renamed = render();
    world.devices = [deviceFixture(0), deviceFixture(1)];
    render();
    expect(world.shipped).toBe(1);
    expect(renamed).not.toBe(before);
    expect(renamed.length).toBe(before.length);
  });

  it('keeps the same entries when the device list is the same', () => {
    const render = mount();
    const before = render();
    const after = render();
    expect(after).toBe(before);
    expect(world.shipped).toBe(1);
  });
});
