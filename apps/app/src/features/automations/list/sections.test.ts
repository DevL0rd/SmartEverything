import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IconName } from '../../../components/icon';
import type { ListActions } from './list-actions';
import { entriesOf } from './list-entries';
import type { ListLinks } from './list-links';
import { contextFor, evented, idOf, rowOf } from './list-fixtures';
import { DEFAULT_VIEW, sectionsOf } from './list-view';

const mounted = vi.hoisted((): string[] => []);

vi.mock('./automation-row', () => ({
  AutomationRow: ({ entry }: { readonly entry: { readonly id: string } }): null => {
    if (!mounted.includes(entry.id)) mounted.push(entry.id);
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

vi.mock('../../../components/grid', () => ({
  Grid: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));

vi.mock('../../../components/text', () => ({ Text: (): null => null }));

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

let frames: (() => void)[] = [];
let root: Root | null = null;

function nextFrame(): void {
  act(() => {
    const due = frames;
    frames = [];
    for (const frame of due) frame();
  });
}

function mount(count: number, paused = 0): void {
  const rows = Array.from({ length: count }, (_, index) =>
    rowOf(index + 1, evented(), { enabled: index >= paused }),
  );
  const sections = sectionsOf(entriesOf(rows, new Map(), contextFor()), DEFAULT_VIEW);
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const target = root;
  act(() => {
    target.render(
      createElement(Sections, {
        sections,
        total: count,
        iconOf: ICON,
        links: LINKS,
        actions: ACTIONS,
        timeZone: null,
      }),
    );
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

describe('list sections on a long list', () => {
  it('mounts six rows at once and six more on each later frame', () => {
    mount(20);
    expect(mounted).toHaveLength(6);
    nextFrame();
    expect(mounted).toHaveLength(12);
    nextFrame();
    nextFrame();
    nextFrame();
    expect(mounted).toHaveLength(20);
  });

  it('mounts rows in section order, needs attention and running first', () => {
    mount(10, 3);
    expect(mounted).toHaveLength(6);
    expect(mounted).not.toContain(idOf(1));
    nextFrame();
    expect(mounted).toContain(idOf(1));
  });

  it('is idle once every row is mounted', () => {
    mount(14);
    nextFrame();
    nextFrame();
    expect(mounted).toHaveLength(14);
    expect(frames).toHaveLength(0);
  });

  it('shows a short list in one commit with no extra frames', () => {
    mount(4);
    expect(mounted).toHaveLength(4);
    expect(frames).toHaveLength(0);
  });
});
