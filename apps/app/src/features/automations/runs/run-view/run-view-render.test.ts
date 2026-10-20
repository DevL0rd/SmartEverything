import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLoops, sameLoops, type LoopInfo } from './run-loops';
import { parseActivationPath, type Activation } from './run-activation';
import type { RunOverlay } from '../../model/canvas/contract';
import { overlayOf } from './run-overlay';

const counts = vi.hoisted(() => ({ renders: new Map<string, number>() }));

interface Passthrough {
  readonly children?: ReactNode;
}

function tally(name: string): void {
  counts.renders.set(name, (counts.renders.get(name) ?? 0) + 1);
}

vi.mock('react-native', () => ({
  View: ({ children }: Passthrough): ReactNode => children,
}));
vi.mock('../../../../components/interactive', () => ({
  Interactive: ({ children, label }: Passthrough & { readonly label?: string }): ReactNode => {
    tally(`interactive:${label ?? ''}`);
    return children;
  },
}));
vi.mock('../../../../components/icon-button', () => ({
  IconButton: ({ label }: { readonly label: string }): null => {
    tally(`icon-button:${label}`);
    return null;
  },
}));
vi.mock('../../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../../design/cn', () => ({ cn: (...parts: unknown[]): string => parts.join(' ') }));

const { LoopStepper } = await import('./loop-stepper');

const NO_OP = (): void => undefined;

function activations(count: number): readonly Activation[] {
  return Array.from({ length: count }, (_, index) => {
    const path = `loop#l1[${String(index + 1)}]/dim`;
    const parsed = parseActivationPath(path);
    return {
      path,
      nodeId: parsed.nodeId,
      loops: parsed.loops,
      iteration: 1,
      status: 'succeeded' as const,
      seq: index + 1,
      startMs: 0,
      endMs: 1,
      preview: null,
      truncated: false,
      error: null,
      commandIds: [],
    };
  });
}

function infoOf(count: number, picked: number): LoopInfo {
  const info = resolveLoops(activations(count), new Map([['l1', picked]])).loops[0];
  if (info === undefined) throw new Error('no loop');
  return info;
}

function mount(): ReturnType<typeof createRoot> {
  return createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
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
  vi.unstubAllGlobals();
  counts.renders.clear();
});

const BUDGET = { mount: 1, equalProps: 0, oneChange: 1 } as const;

describe('the run view render budget', () => {
  it('renders the loop stepper once, not for equal props, and once per real step', () => {
    const root = mount();
    const info = infoOf(4, 2);
    const props = { info, name: 'Light', onPick: NO_OP };
    act(() => {
      root.render(createElement(LoopStepper, props));
    });
    expect(counts.renders.get('icon-button:Next light')).toBe(BUDGET.mount);
    act(() => {
      root.render(createElement(LoopStepper, { ...props }));
    });
    expect(counts.renders.get('icon-button:Next light')).toBe(BUDGET.mount + BUDGET.equalProps);
    act(() => {
      root.render(createElement(LoopStepper, { ...props, info: infoOf(4, 3) }));
    });
    expect(counts.renders.get('icon-button:Next light')).toBe(BUDGET.mount + BUDGET.oneChange);
  });

  it('keeps the loop identity while a recomputation finds the same loops', () => {
    const first = resolveLoops(activations(4), new Map()).loops;
    const again = resolveLoops(activations(4), new Map()).loops;
    const grown = resolveLoops(activations(5), new Map()).loops;
    expect(first).not.toBe(again);
    expect(sameLoops(first, again)).toBe(true);
    expect(sameLoops(first, grown)).toBe(false);
  });

  it('changes only the overlay entries whose node changed when one node state arrives', () => {
    const base = activations(1);
    const input = (list: readonly Activation[]): RunOverlay => {
      const { loops, chosen } = resolveLoops(list, new Map());
      return overlayOf({
        activations: list,
        chosen,
        loops,
        itemNames: new Map(),
        at: null,
        wakeAt: null,
        zone: null,
      });
    };
    const before = input(base);
    const after = input([
      ...base,
      { ...base[0]!, path: 'other', nodeId: 'other', loops: [], seq: 9 },
    ]);
    const changed = Object.keys(after).filter(
      (id) => JSON.stringify(after[id]) !== JSON.stringify(before[id]),
    );
    expect(changed.sort()).toEqual(['other']);
  });
});
