import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IconName } from '../../../components/icon';
import type { ListActions } from './list-actions';
import { entriesOf, type ListEntry } from './list-entries';
import type { ListLinks } from './list-links';
import { contextFor, evented, rowOf } from './list-fixtures';
import { DEFAULT_VIEW, sectionsOf } from './list-view';

const counts = vi.hoisted(() => ({ renders: new Map<string, number>(), menus: 0 }));

interface Passthrough {
  readonly children?: ReactNode;
}

function tally(name: string): void {
  counts.renders.set(name, (counts.renders.get(name) ?? 0) + 1);
}

vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, View: ({ children }: Passthrough): ReactNode => children };
});
vi.mock('../../../components/grid', () => ({
  Grid: ({ children }: Passthrough): ReactNode => children,
}));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/badge', () => ({ Badge: (): null => null }));
vi.mock('../../../components/icon-well', () => ({ IconWell: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/switch', () => ({ Switch: (): null => null }));
vi.mock('../../../components/interactive', () => ({
  Interactive: ({ children, label }: Passthrough & { readonly label?: string }): ReactNode => {
    tally(`row:${label ?? ''}`);
    return children;
  },
}));
vi.mock('../../../components/menu', () => ({
  OverflowButton: (): null => null,
  useContextMenu: (): { onLongPress: () => void; onContextMenu: () => void; host: null } => {
    counts.menus += 1;
    return { onLongPress: (): void => undefined, onContextMenu: (): void => undefined, host: null };
  },
}));
vi.mock('../../../design/cn', () => ({ cn: (...parts: unknown[]): string => parts.join(' ') }));
vi.mock('../../../format/time', () => ({ clock: (): string => '12:00' }));
vi.mock('./row-menu', () => ({ useRowMenu: (): readonly never[] => [] }));
vi.mock('./run-bars', () => ({ RunBars: (): null => null }));

const { Sections } = await import('./sections');

const ICON = (): IconName => 'automations';
const LINKS: ListLinks = {
  open: () => '/',
  edit: () => '/',
  runs: () => '/',
  workspace: [],
  extras: [],
};
const ACTIONS: ListActions = {
  toggle: vi.fn(),
  run: vi.fn(),
  duplicate: vi.fn(),
  remove: vi.fn(),
};
const ROWS = 5;

let frames: (() => void)[] = [];
let root: Root | null = null;

function entries(): readonly ListEntry[] {
  const rows = Array.from({ length: ROWS }, (_, index) => rowOf(index + 1, evented()));
  return entriesOf(rows, new Map(), contextFor());
}

function render(list: readonly ListEntry[]): void {
  const target =
    root ??
    createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
  root = target;
  const sections = sectionsOf(list, DEFAULT_VIEW);
  act(() => {
    target.render(
      createElement(Sections, {
        sections,
        total: list.length,
        iconOf: ICON,
        links: LINKS,
        actions: ACTIONS,
        timeZone: null,
      }),
    );
  });
}

function renders(name: string): number {
  return counts.renders.get(`row:${name}`) ?? 0;
}

beforeEach(() => {
  counts.renders.clear();
  counts.menus = 0;
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

describe('the automations list render budget', () => {
  it('renders each row once on mount and schedules no further frames', () => {
    render(entries());
    expect(counts.menus).toBe(ROWS);
    expect([...counts.renders.values()]).toEqual(Array.from({ length: ROWS }, () => 1));
    expect(frames).toHaveLength(0);
  });

  it('does not re-render any row when the list is recomputed with equal entries', () => {
    const list = entries();
    render(list);
    render(list.map((entry) => ({ ...entry })));
    expect(counts.menus).toBe(ROWS);
  });

  it('re-renders only the row whose entry changed', () => {
    const list = entries();
    render(list);
    const changed = list[2];
    if (changed === undefined) throw new Error('no entry');
    render(list.map((entry) => (entry === changed ? { ...entry, enabled: false } : entry)));
    expect(counts.menus).toBe(ROWS + 1);
    expect(renders('Rule 3, paused')).toBe(1);
    expect(renders('Rule 1')).toBe(1);
  });
});
