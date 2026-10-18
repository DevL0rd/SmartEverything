import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutomationRow } from '@smarteverything/domain';
import { ruleOf, type RuleView } from '../data/use-automations';
import { catalogFixture } from '../model/catalog-fixture';

const mounted = vi.hoisted((): string[] => []);

vi.mock('./automation-row', () => ({
  AutomationRow: ({ rule }: { readonly rule: { readonly row: { readonly id: string } } }): null => {
    if (!mounted.includes(rule.row.id)) mounted.push(rule.row.id);
    return null;
  },
}));

vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
  };
});

vi.mock('../../../components/section', () => ({
  List: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));

vi.mock('../../../components/text', () => ({ Text: (): null => null }));

const { AutomationSections } = await import('./automation-sections');

let frames: (() => void)[] = [];
let root: Root | null = null;

function nextFrame(): void {
  act(() => {
    const due = frames;
    frames = [];
    for (const frame of due) frame();
  });
}

function idOf(index: number): string {
  return `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function rule(index: number, section: RuleView['section']): RuleView {
  const catalog = catalogFixture();
  const row: AutomationRow = {
    id: idOf(index),
    name: `Rule ${String(index)}`,
    enabled: true,
    revision: 1,
    definition: {},
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  };
  return { ...ruleOf(row, catalog.names), section };
}

function mount(rules: readonly RuleView[], query = ''): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const target = root;
  act(() => {
    target.render(createElement(AutomationSections, { rules, catalog: catalogFixture(), query }));
  });
}

beforeEach(() => {
  mounted.length = 0;
  frames = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('automation sections on a long list', () => {
  const rules = Array.from({ length: 20 }, (_, index) => rule(index, 'scheduled'));

  it('mounts a first batch of rows at once and the rest on later frames', () => {
    mount(rules);
    expect(mounted).toHaveLength(6);
    nextFrame();
    expect(mounted).toHaveLength(12);
    nextFrame();
    nextFrame();
    nextFrame();
    expect(mounted).toHaveLength(20);
  });

  it('mounts rows in the order of the sections they are shown in', () => {
    const mixed = [rule(0, 'paused'), ...rules.slice(1, 8), rule(8, 'attention')];
    mount(mixed);
    expect(mounted[0]).toBe(idOf(8));
    expect(mounted).not.toContain(idOf(0));
    nextFrame();
    expect(mounted).toContain(idOf(0));
  });

  it('shows a short list in one commit with no extra frames', () => {
    mount(rules.slice(0, 4));
    expect(mounted).toHaveLength(4);
    expect(frames).toHaveLength(0);
  });
});
