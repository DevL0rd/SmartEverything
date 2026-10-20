import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeSessionsKey } from '../../../queries/keys';
import { useRefetchWhenLinksChange } from './desktop-history';

const TARGETS = [
  { deviceId: 'pc-1', name: 'Desk' },
  { deviceId: 'pc-2', name: 'Laptop' },
];
const roots: ReturnType<typeof createRoot>[] = [];

function Watcher({ links }: { readonly links: string }): ReactNode {
  useRefetchWhenLinksChange(TARGETS, links);
  return null;
}

function render(client: QueryClient, links: string): ReturnType<typeof createRoot> {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  roots.push(root);
  show(root, client, links);
  return root;
}

function show(root: ReturnType<typeof createRoot>, client: QueryClient, links: string): void {
  act(() => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Watcher, { links })));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  vi.unstubAllGlobals();
});

describe('the Desktop session lists follow the links to app chats', () => {
  it('fetches every computer list again when a chat is linked or unlinked, not on the first render', () => {
    const client = new QueryClient();
    const asked: unknown[] = [];
    client.invalidateQueries = (filters): Promise<void> => {
      asked.push(filters?.queryKey);
      return Promise.resolve();
    };
    const root = render(client, 's1');
    expect(asked).toEqual([]);
    show(root, client, 's1');
    expect(asked).toEqual([]);
    show(root, client, 's1\ns2');
    expect(asked).toEqual(TARGETS.map((target) => nativeSessionsKey(target.deviceId, false)));
  });
});
