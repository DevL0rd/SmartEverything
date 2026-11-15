import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOW_SCOPE_OUTPUTS, NODE_REGISTRY, STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { DocumentStore } from '../../model/editor/document-store';
import { automation, note, start } from '../../model/graph/graph-scene-fixtures';
import type { LiveCheck } from './problem-model';
import { useLiveCheck } from './use-live-check';

function contextOf(): LintContext {
  return {
    kinds: (id) => NODE_REGISTRY.get(id),
    scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
    references: () => true,
    functions: () => undefined,
    secrets: new Set(),
    automations: () => undefined,
  };
}

function brokenStore(): DocumentStore {
  return new DocumentStore(
    automation([
      start('a'),
      note('a', undefined, { ports: { message: { wire: { from: 'gone', port: 'value' } } } }),
    ]),
    STATIC_KIND_LOOKUP,
  );
}

let root: Root | null = null;

function mount(store: DocumentStore): (context: LintContext) => LiveCheck {
  const seen: LiveCheck[] = [];
  function Probe({ context }: { readonly context: LintContext }): ReactNode {
    const check = useLiveCheck(store, context, NODE_REGISTRY);
    seen.push(check);
    return null;
  }
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  return (context) => {
    act(() => {
      created.render(createElement(Probe, { context }));
    });
    const latest = seen.at(-1);
    if (latest === undefined) throw new Error('the probe did not render');
    return latest;
  };
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

describe('live check identity', () => {
  it('keeps the check and its scene problems when a new context finds the same problems', () => {
    const render = mount(brokenStore());
    const before = render(contextOf());
    const after = render(contextOf());
    expect(before.findings.length).toBeGreaterThan(0);
    expect(after).toBe(before);
    expect(after.scene).toBe(before.scene);
  });

  it('gives a new check when the findings change', () => {
    const store = brokenStore();
    const render = mount(store);
    const before = render(contextOf());
    store.state.update((state) => ({ ...state, program: automation([start('a'), note('a')]) }));
    const after = render(contextOf());
    expect(after).not.toBe(before);
    expect(after.findings.length).toBeLessThan(before.findings.length);
  });
});
