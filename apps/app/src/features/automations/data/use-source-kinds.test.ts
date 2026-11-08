import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NODE_REGISTRY } from '@smarteverything/domain';
import * as hubApi from './api';
import { kindLookupOf, type KindLookup } from './kind-lookup';
import {
  AutomationsSourceContext,
  useAutomationsSource,
  type AutomationsSource,
  type ResolvedAutomationsSource,
} from './source';
import { PING_KIND_ID, kindRow } from '../../../test-support/plugin-kinds';

let root: Root | null = null;

function sourceOf(kindSource: AutomationsSource['kindSource']): AutomationsSource {
  return {
    api: hubApi,
    automations: {
      snapshot: () => ({ rows: [], rejected: 0, unstructured: [] }),
      subscribe: () => () => undefined,
    },
    kindSource,
    trace: { hold: () => () => undefined },
    runChanges: () => () => undefined,
  };
}

function mount(source: AutomationsSource): () => ResolvedAutomationsSource | null {
  let latest: ResolvedAutomationsSource | null = null;
  function Probe(): ReactNode {
    latest = useAutomationsSource();
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
      createElement(AutomationsSourceContext, { value: source }, createElement(Probe)),
    );
  });
  return (): ResolvedAutomationsSource | null => latest;
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
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('useAutomationsSource kinds', () => {
  it('lists the static kinds first and the stored plugin kinds after them', () => {
    const lookup = kindLookupOf([kindRow()]);
    const read = mount(
      sourceOf({
        snapshot: () => lookup,
        subscribe: (): (() => void) => (): void => undefined,
      }),
    );
    expect(read()?.lookup).toBe(lookup);
    expect(read()?.kinds).toBe(lookup.kinds);
    expect(read()?.lookup.has(PING_KIND_ID)).toBe(true);
    expect(read()?.kinds.slice(0, NODE_REGISTRY.kinds.length)).toEqual(NODE_REGISTRY.kinds);
  });

  it('follows the stored kinds when they change', () => {
    let current: KindLookup = NODE_REGISTRY;
    const listeners = new Set<() => void>();
    const subscribe = (listener: () => void): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    };
    const read = mount(sourceOf({ snapshot: () => current, subscribe }));
    expect(read()?.lookup.has(PING_KIND_ID)).toBe(false);
    act(() => {
      current = kindLookupOf([kindRow('off')]);
      for (const listener of listeners) listener();
    });
    expect(read()?.lookup.has(PING_KIND_ID)).toBe(true);
    expect(read()?.kinds.some((kind) => kind.id === PING_KIND_ID)).toBe(true);
  });
});
