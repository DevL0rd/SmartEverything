import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOARD_LAYOUT_VERSION,
  type BoardClass,
  type BoardLayout,
  type BoardWidget,
} from '@smarteverything/domain';
import type { BoardDefaults, BoardLayoutState } from '../types';

type Updater = (previous: unknown) => unknown;

const hooks: { session: unknown; gesture: { current: boolean } } = vi.hoisted(() => ({
  session: null,
  gesture: { current: false },
}));

function isUpdater(value: unknown): value is Updater {
  return typeof value === 'function';
}

vi.mock('react', () => ({
  useState: (): [unknown, (update: unknown) => void] => [
    hooks.session,
    (update: unknown): void => {
      hooks.session = isUpdater(update) ? update(hooks.session) : update;
    },
  ],
  useRef: (): { current: boolean } => hooks.gesture,
}));

const { useBoardEditor } = await import('./use-board-editor');

const DEFAULTS: BoardDefaults = {
  compact: [{ key: 'a', type: 'a', size: 'M' }],
  medium: [{ key: 'm', type: 'm', size: 'M' }],
  expanded: [],
};

const READY: BoardLayoutState = { status: 'ready', layout: null };

const saved: BoardLayout[] = [];

function useEditor(layout: BoardLayoutState = READY): ReturnType<typeof useBoardEditor> {
  return useBoardEditor({
    page: 'home',
    layout,
    defaults: DEFAULTS,
    onSave: (next) => saved.push(next),
  });
}

function add(key: string): (widgets: readonly BoardWidget[]) => readonly BoardWidget[] {
  return (widgets) => [...widgets, { key, type: key, size: 'M' }];
}

function useKeys(board: BoardClass): string[] {
  return useEditor()
    .arrangement(board)
    .map((widget) => widget.key);
}

describe('useBoardEditor', () => {
  beforeEach(() => {
    hooks.session = null;
    hooks.gesture.current = false;
    saved.length = 0;
  });

  it('shows the defaults of a board until the layout stores its own', () => {
    expect(useKeys('compact')).toEqual(['a']);
    const stored: BoardLayout = {
      version: BOARD_LAYOUT_VERSION,
      classes: { compact: { widgets: [{ key: 'z', type: 'z', size: 'XL' }] } },
    };
    const shown = useEditor({ status: 'ready', layout: stored });
    expect(shown.arrangement('compact').map((widget) => widget.key)).toEqual(['z']);
    expect(shown.arrangement('medium').map((widget) => widget.key)).toEqual(['m']);
  });

  it('starts editing only once the layout is ready', () => {
    useEditor({ status: 'loading' }).begin();
    expect(useEditor().editing).toBe(false);
    useEditor().begin('options');
    const now = useEditor();
    expect(now.editing).toBe(true);
    expect(now.opening).toBe('options');
    expect(now.dirty).toBe(false);
    expect(now.header).not.toBeNull();
  });

  it('keeps a draft apart from the stored layout until done, then saves it once', () => {
    useEditor().begin();
    useEditor().change('compact', add('b'), 'step');
    const draft = useEditor();
    expect(draft.dirty).toBe(true);
    expect(draft.arrangement('compact').map((widget) => widget.key)).toEqual(['a', 'b']);
    expect(saved).toEqual([]);
    draft.done();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.classes.compact?.widgets.map((widget) => widget.key)).toEqual(['a', 'b']);
    expect(useEditor().editing).toBe(false);
  });

  it('saves nothing on done when nothing changed, and nothing on cancel', () => {
    useEditor().begin();
    useEditor().done();
    expect(saved).toEqual([]);
    useEditor().begin();
    useEditor().change('compact', add('b'), 'step');
    useEditor().cancel();
    expect(saved).toEqual([]);
    expect(useEditor().editing).toBe(false);
    expect(useKeys('compact')).toEqual(['a']);
  });

  it('is not dirty when a change leaves a stored arrangement as it was', () => {
    const stored: BoardLayoutState = {
      status: 'ready',
      layout: {
        version: BOARD_LAYOUT_VERSION,
        classes: { compact: { widgets: [{ key: 'z', type: 'z', size: 'XL' }] } },
      },
    };
    useEditor(stored).begin();
    useEditor(stored).change('compact', (widgets) => widgets, 'step');
    const now = useEditor(stored);
    expect(now.dirty).toBe(false);
    expect(now.canUndo).toBe(false);
    now.done();
    expect(saved).toEqual([]);
  });

  it('undoes one step at a time', () => {
    useEditor().begin();
    useEditor().change('compact', add('b'), 'step');
    useEditor().change('compact', add('c'), 'step');
    useEditor().undo();
    expect(useKeys('compact')).toEqual(['a', 'b']);
    useEditor().undo();
    expect(useKeys('compact')).toEqual(['a']);
    expect(useEditor().canUndo).toBe(false);
    useEditor().undo();
    expect(useKeys('compact')).toEqual(['a']);
  });

  it('records a drag or resize gesture as one undo step until it settles', () => {
    useEditor().begin();
    useEditor().change('compact', add('b'), 'gesture');
    useEditor().change('compact', add('c'), 'gesture');
    useEditor().undo();
    expect(useKeys('compact')).toEqual(['a']);
    useEditor().change('compact', add('b'), 'gesture');
    useEditor().settle();
    useEditor().change('compact', add('c'), 'gesture');
    useEditor().undo();
    expect(useKeys('compact')).toEqual(['a', 'b']);
  });

  it('resets one board to its defaults and leaves the others', () => {
    useEditor().begin();
    useEditor().change('compact', add('b'), 'step');
    useEditor().change('medium', add('n'), 'step');
    useEditor().reset('compact');
    expect(useKeys('compact')).toEqual(['a']);
    expect(useKeys('medium')).toEqual(['m', 'n']);
    useEditor().undo();
    expect(useKeys('compact')).toEqual(['a', 'b']);
  });

  it('does not change anything outside an edit session', () => {
    useEditor().change('compact', add('b'), 'step');
    expect(useKeys('compact')).toEqual(['a']);
    expect(useEditor().editing).toBe(false);
  });
});
