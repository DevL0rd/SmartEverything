import type { FlashListRef } from '@shopify/flash-list';
import { act, createElement, type ReactElement, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScopeVisible } from '../design/visibility';
import type { ListRow } from './virtual-list-rows';
import type { RowTracking } from './virtual-list-visibility';

type ListHandle = Pick<
  FlashListRef<ListRow<Device>>,
  | 'getLayout'
  | 'computeVisibleIndices'
  | 'getWindowSize'
  | 'getAbsoluteLastScrollOffset'
  | 'getFirstItemOffset'
  | 'recomputeViewableItems'
>;

interface ListProps {
  readonly ref?: Ref<ListHandle>;
  readonly removeClippedSubviews?: boolean;
  readonly stickyHeaderIndices?: readonly number[];
  readonly getItemType?: (row: { readonly kind: string }) => string;
  readonly data?: readonly ListRow<Device>[];
  readonly renderItem: (info: {
    readonly item: ListRow<Device>;
    readonly index: number;
    readonly target: 'Cell';
  }) => ReactElement;
  readonly viewabilityConfigCallbackPairs?: RowTracking['pairs'];
}

const seen = vi.hoisted((): ListProps[] => []);
const refreshedKeys = vi.hoisted(() => vi.fn<(keys: readonly string[]) => void>());
const viewport = vi.hoisted(() => ({
  ready: true,
  headerHeight: 0,
  startIndex: 0,
  endIndex: 2,
  mountedKey: '',
}));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));

vi.mock('@shopify/flash-list', async () => {
  const { useImperativeHandle } = await import('react');
  return {
    FlashList: (props: ListProps): ReactNode => {
      const { data, ref, renderItem } = props;
      useImperativeHandle(
        ref,
        () => ({
          getLayout: (index) =>
            viewport.ready && data?.[index] !== undefined
              ? { x: 0, y: index * 100, width: 400, height: 100 }
              : undefined,
          computeVisibleIndices: () => {
            if (!viewport.ready) throw new Error('layout is not ready');
            return { startIndex: viewport.startIndex, endIndex: viewport.endIndex };
          },
          getWindowSize: () => ({ width: 400, height: 400 }),
          getAbsoluteLastScrollOffset: () => 0,
          getFirstItemOffset: () => viewport.headerHeight,
          recomputeViewableItems: () => refreshedKeys(data?.map((row) => row.key) ?? []),
        }),
        [data],
      );
      seen.push(props);
      const index = data?.findIndex((row) => row.key === viewport.mountedKey) ?? -1;
      const item = data?.[index];
      return item === undefined ? null : renderItem({ item, index, target: 'Cell' });
    },
  };
});

const { VirtualList } = await import('./virtual-list');

let root: Root | null = null;
const observedVisibility = vi.fn<(visible: boolean) => void>();

beforeEach(() => {
  seen.length = 0;
  refreshedKeys.mockClear();
  observedVisibility.mockClear();
  Object.assign(viewport, {
    ready: true,
    headerHeight: 0,
    startIndex: 0,
    endIndex: 2,
    mountedKey: '',
  });
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
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('a sectioned virtual list with sticky headers', () => {
  it('marks the section headers sticky by data index and types them apart from rows', () => {
    act(() => {
      root?.render(
        createElement(VirtualList<string>, {
          sections: [
            { key: 'included', title: 'Included', data: ['a', 'b'] },
            { key: 'added', title: 'Added', data: ['c'] },
          ],
          keyOf: (item: string) => item,
          renderItem: (item: string): ReactElement => createElement('span', null, item),
        }),
      );
    });
    const props = seen.at(-1);
    expect(props?.stickyHeaderIndices).toEqual([0, 3]);
    expect(props?.removeClippedSubviews).toBeUndefined();
    const types = props?.data?.map((row) => props.getItemType?.(row));
    expect(types).toEqual(['header', 'item', 'item', 'header', 'item']);
  });
});

interface Device {
  readonly key: string;
  readonly power: boolean;
}

const deviceKey = (device: Device): string => device.key;

function DeviceScope(): null {
  observedVisibility(useScopeVisible());
  return null;
}

const renderDevice = (): ReactElement => createElement(DeviceScope);

function showDevices(keys: readonly string[], power = true): void {
  const data = keys.map((key) => ({ key, power }));
  act(() => {
    root?.render(
      createElement(VirtualList<Device>, {
        sections: data.length === 0 ? [] : [{ key: 'room', title: 'Room', data }],
        keyOf: deviceKey,
        renderItem: renderDevice,
      }),
    );
  });
}

describe('viewability for changing row keys', () => {
  it('refreshes the mounted list for replacements, reorder and clear at the same indices', () => {
    const unfiltered = ['fan-01', 'diffuser-02', 'fan-03', 'diffuser-04'];
    showDevices(unfiltered);
    const initial = seen.at(-1);
    expect(refreshedKeys).not.toHaveBeenCalled();

    showDevices(unfiltered, false);
    expect(seen.at(-1)?.data).not.toBe(initial?.data);
    expect(refreshedKeys).not.toHaveBeenCalled();

    showDevices(['diffuser-02', 'diffuser-04']);
    expect(refreshedKeys).toHaveBeenNthCalledWith(1, [
      'room:header',
      'room:diffuser-02',
      'room:diffuser-04',
    ]);
    showDevices(['diffuser-04', 'diffuser-02']);
    expect(refreshedKeys).toHaveBeenNthCalledWith(2, [
      'room:header',
      'room:diffuser-04',
      'room:diffuser-02',
    ]);
    showDevices(unfiltered);
    expect(refreshedKeys).toHaveBeenCalledTimes(3);
    showDevices([]);
    expect(refreshedKeys).toHaveBeenCalledTimes(3);
    showDevices(unfiltered);
    expect(refreshedKeys).toHaveBeenCalledTimes(4);
    expect(seen.at(-1)?.viewabilityConfigCallbackPairs).toBe(
      initial?.viewabilityConfigCallbackPairs,
    );
  });

  it.each([
    { headerHeight: 500, startIndex: -1, endIndex: -2 },
    { headerHeight: 400, startIndex: 0, endIndex: 0 },
  ])('hides a retained cell when a list header occupies the viewport', (covered) => {
    viewport.mountedKey = 'room:retained';
    showDevices(['retained']);
    const pair = seen.at(-1)?.viewabilityConfigCallbackPairs?.[0];
    act(() => {
      pair?.onViewableItemsChanged({
        viewableItems: [{ key: 'room:retained', index: 1, isViewable: true }],
      });
    });
    expect(observedVisibility).toHaveBeenLastCalledWith(true);

    showDevices(['retained', 'other']);
    expect(observedVisibility).toHaveBeenLastCalledWith(true);

    Object.assign(viewport, covered);
    showDevices(['other', 'retained']);
    expect(refreshedKeys).toHaveBeenCalledTimes(2);
    expect(observedVisibility).toHaveBeenLastCalledWith(false);

    act(() => {
      pair?.onViewableItemsChanged({
        viewableItems: [{ key: 'room:retained', index: 2, isViewable: true }],
      });
    });
    expect(observedVisibility).toHaveBeenLastCalledWith(true);
  });

  it('waits for the normal first layout when row keys change before measurement', () => {
    viewport.ready = false;
    showDevices(['fan-01']);
    showDevices(['diffuser-02']);
    expect(refreshedKeys).not.toHaveBeenCalled();
  });
});
