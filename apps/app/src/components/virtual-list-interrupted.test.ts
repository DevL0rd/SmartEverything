import { act, createElement, useEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecyclerViewManager } from '@shopify/flash-list/dist/recyclerview/hooks/useRecyclerViewManager';
import type { RecyclerViewManager } from '@shopify/flash-list/dist/recyclerview/RecyclerViewManager';

interface Row {
  readonly kind: string;
  readonly key: string;
}

interface Shown {
  readonly data: readonly Row[];
  readonly tick: number;
}

interface Controls {
  readonly manager: RecyclerViewManager<Row>;
  readonly show: (update: (shown: Shown) => Shown) => void;
}

const SHORT = rowsOf(3);
const LONG = rowsOf(10);

function rowsOf(count: number): readonly Row[] {
  return Array.from({ length: count }, (_, index) => ({ kind: 'item', key: String(index) }));
}

function List({
  data,
  tick,
  onManager,
}: {
  readonly data: readonly Row[];
  readonly tick: number;
  readonly onManager: (manager: RecyclerViewManager<Row>) => void;
}): ReactNode {
  const { recyclerViewManager } = useRecyclerViewManager<Row>({
    data,
    extraData: tick,
    renderItem: null,
    keyExtractor: (row) => row.key,
    getItemType: (row) => row.kind,
  });
  for (const [, { index }] of recyclerViewManager.getRenderStack()) {
    recyclerViewManager.getLayout(index);
  }
  useEffect(() => {
    onManager(recyclerViewManager);
  }, [onManager, recyclerViewManager]);
  return null;
}

function Screen({ onReady }: { readonly onReady: (controls: Controls) => void }): ReactNode {
  const [shown, show] = useState<Shown>({ data: SHORT, tick: 0 });
  const [manager, setManager] = useState<RecyclerViewManager<Row> | null>(null);
  useEffect(() => {
    if (manager !== null) onReady({ manager, show });
  }, [manager, onReady]);
  return createElement(List, { data: shown.data, tick: shown.tick, onManager: setManager });
}

let root: Root | null = null;
let controls: Controls | null = null;

function ready(): Controls {
  if (controls === null) throw new Error('list not mounted');
  return controls;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const mounted = root;
  act(() => {
    mounted.render(
      createElement(Screen, {
        onReady: (next: Controls): void => {
          controls = next;
        },
      }),
    );
  });
  act(() => {
    ready().manager.updateLayoutParams({ width: 400, height: 800 }, 0);
    ready().manager.modifyChildrenLayout([], SHORT.length);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  controls = null;
  vi.unstubAllGlobals();
});

describe('a virtual list whose longer rows were rendered and then thrown away', () => {
  it('lays out only the rows of the render that commits', () => {
    const { manager, show } = ready();
    manager.updateProps({ ...manager.props, data: LONG });
    manager.processDataUpdate();
    expect(() => {
      act(() => {
        show((shown) => ({ ...shown, tick: shown.tick + 1 }));
      });
    }).not.toThrow();
    const indices = [...manager.getRenderStack().values()].map(({ index }) => index);
    expect(indices.length).toBeGreaterThan(0);
    expect(indices.every((index) => index < SHORT.length)).toBe(true);
    expect(() => manager.getLayout(SHORT.length)).toThrow();
  });
});
