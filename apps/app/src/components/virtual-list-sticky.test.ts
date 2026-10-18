import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ListProps {
  readonly removeClippedSubviews?: boolean;
  readonly stickyHeaderIndices?: readonly number[];
  readonly getItemType?: (row: { readonly kind: string }) => string;
  readonly data?: readonly { readonly kind: string }[];
}

const seen = vi.hoisted((): ListProps[] => []);

vi.mock('@shopify/flash-list', () => ({
  FlashList: (props: ListProps): null => {
    seen.push(props);
    return null;
  },
}));

const { VirtualList } = await import('./virtual-list');

let root: Root | null = null;

beforeEach(() => {
  seen.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
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
    root = createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
    const mounted = root;
    act(() => {
      mounted.render(
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
