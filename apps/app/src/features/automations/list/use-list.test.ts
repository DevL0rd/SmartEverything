import {
  ALL_NODE_KINDS,
  STATIC_KIND_LOOKUP,
  type AutomationRunSummary,
} from '@smarteverything/domain';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutomationRow } from '../data/graph-adapter';
import { KITCHEN_ROOM, NOW, evented, rowOf, runOf } from './list-fixtures';
import type { AutomationsList, ListEnvironment } from './use-list';

interface Data {
  rows: readonly AutomationRow[];
  runs: readonly AutomationRunSummary[];
}

const data = vi.hoisted((): Data => ({ rows: [], runs: [] }));

vi.mock('../data/use-automations', () => ({
  useAutomations: (): { rows: readonly AutomationRow[]; rejected: number } => ({
    rows: data.rows,
    rejected: 0,
  }),
}));
vi.mock('../data/use-runs', () => ({
  useRuns: (): { data: readonly AutomationRunSummary[] } => ({ data: data.runs }),
}));
vi.mock('../data/source', () => ({
  useAutomationsSource: (): { kinds: typeof ALL_NODE_KINDS } => ({ kinds: ALL_NODE_KINDS }),
}));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => NOW }));

const { useAutomationsList } = await import('./use-list');

const ENVIRONMENT: ListEnvironment = {
  names: () => undefined,
  functions: () => undefined,
  rooms: new Map([[KITCHEN_ROOM, 'Kitchen']]),
  updates: new Set(),
  place: { timeZone: 'UTC', location: null },
};

let root: Root | null = null;
let seen: AutomationsList[] = [];

function Probe(): ReactNode {
  seen.push(useAutomationsList(ENVIRONMENT));
  return null;
}

function rowsOf(count: number): readonly AutomationRow[] {
  return Array.from({ length: count }, (_, index) =>
    rowOf(index + 1, evented(), {}, STATIC_KIND_LOOKUP),
  );
}

function render(): void {
  const target =
    root ??
    createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
  root = target;
  act(() => {
    target.render(createElement(Probe));
  });
}

function latest(): AutomationsList {
  const list = seen.at(-1);
  if (list === undefined) throw new Error('The probe never rendered.');
  return list;
}

beforeEach(() => {
  seen = [];
  data.rows = rowsOf(3);
  data.runs = [runOf(1, 1, 'succeeded', '2026-10-18T11:00:00.000Z')];
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

describe('the automations list identities', () => {
  it('keeps the filter choices, handlers and search when a run change leaves the counts equal', () => {
    data.rows = rowsOf(9);
    render();
    const before = latest();
    data.runs = [
      runOf(1, 1, 'succeeded', '2026-10-18T11:00:00.000Z'),
      runOf(2, 2, 'succeeded', '2026-10-18T11:30:00.000Z'),
    ];
    render();
    const after = latest();
    expect(after.entries).not.toBe(before.entries);
    expect(after.choices).toBe(before.choices);
    expect(after.setFilter).toBe(before.setFilter);
    expect(after.setSort).toBe(before.setSort);
    expect(after.search).toBeDefined();
    expect(after.search).toBe(before.search);
  });

  it('hands out new choices when a count changes', () => {
    render();
    const before = latest();
    data.rows = data.rows.map((row, index) => (index === 0 ? { ...row, enabled: false } : row));
    render();
    const after = latest();
    expect(after.choices).not.toBe(before.choices);
    expect(after.choices.find((choice) => choice.id === 'paused')?.count).toBe(1);
  });

  it('changes only the chosen part of the view through the stable setters', () => {
    data.rows = rowsOf(9);
    render();
    act(() => {
      latest().search?.onChange('Rule');
    });
    act(() => {
      latest().setFilter('paused');
    });
    act(() => {
      latest().setSort('last-run');
    });
    expect(latest().view).toEqual({ filter: 'paused', sort: 'last-run', query: 'Rule' });
  });
});
