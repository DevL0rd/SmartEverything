import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLedger } from './command-ledger';
import { EntityStore } from './entity-store';
import type * as StoreContextModule from './store-context';

type StoreModule = typeof StoreContextModule;

async function storeModuleBeforeAndAfterRefresh(): Promise<{
  readonly before: StoreModule;
  readonly after: StoreModule;
}> {
  const runtime = await import('./store-runtime');
  const before = await import('./store-context');
  vi.resetModules();
  vi.doMock('./store-runtime', () => runtime);
  const after = await import('./store-context');
  return { before, after };
}

function render(element: ReactNode): void {
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(element);
  });
  act(() => {
    root.unmount();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  vi.doUnmock('./store-runtime');
  vi.unstubAllGlobals();
});

describe('store provider across a fast refresh', () => {
  it('keeps serving hooks from a re-executed store module to the provider element rendered before the refresh', async () => {
    const { before, after } = await storeModuleBeforeAndAfterRefresh();
    expect(after.useEntityStore).not.toBe(before.useEntityStore);
    const store = new EntityStore();
    const seen: EntityStore[] = [];
    function Reader(): ReactNode {
      seen.push(after.useEntityStore());
      return null;
    }
    const cachedBeforeRefresh = before.StoreProvider({
      runtime: { store, ledger: new CommandLedger(store) },
      children: createElement(Reader),
    });

    render(cachedBeforeRefresh);

    expect(seen).toEqual([store]);
  });
});
