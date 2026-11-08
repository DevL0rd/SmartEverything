import { act, createElement, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_MAP_WRITE } from '@smarteverything/domain';
import { ScreenPause, ScreenPausedContext } from '../../../../design/screen-pause';
import { NO_EDIT_OVERLAY } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import {
  FLOOR_ID,
  SOFA_ID,
  floorWith,
  idleRoomFlow,
  onlyObject,
  sofa,
  specOf,
} from '../tools/furniture-fixture';
import type { FurnitureTool } from '../tools/furniture';
import type { EditorHistory, Manipulation } from './use-manipulation';
import type { StageMenu } from './stage-menu';

const none = (): null => null;
const furniture = vi.hoisted(() => vi.fn());
const screen = vi.hoisted(() => ({ focused: true, foreground: true }));
vi.mock('../../../../design/animation-gate', () => ({
  useScreenLive: (): { focused: boolean; foreground: boolean } => screen,
}));
vi.mock('react-native', () => ({ View: none }));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => 'copy' }));
vi.mock('../../../../design/platform', () => ({ isNative: (): boolean => false }));
vi.mock('../../../../store/selectors', () => ({
  useRooms: (): readonly never[] => [],
  useDevices: (): readonly never[] => [],
}));
vi.mock('../../../../api/transport', () => ({ api: vi.fn() }));
vi.mock('../../../../components/button', () => ({ Button: none }));
vi.mock('../../../../components/text', () => ({ Text: none }));
vi.mock('../../../../platform/haptics', () => ({ selectionTick: vi.fn() }));
vi.mock('../docked-panel', () => ({ useSelectionSurface: (): string => 'menu' }));
vi.mock('../tools/furniture', () => ({ useFurnitureTool: furniture }));
vi.mock('../tools/catalogue-panel', () => ({ FurniturePanel: none }));
vi.mock('../tools/device-tray', () => ({ FlowRow: none }));
vi.mock('./context-menu', () => ({ ObjectContextMenu: none }));
vi.mock('./contextual-bar', () => ({ ContextualBar: none }));

const { useStageMenu } = await import('./stage-menu');
const { useFurnitureMount } = await import('../tools/furniture-mount');

class KeyEvent extends Event {
  readonly metaKey = false;
  readonly isComposing = false;

  constructor(
    readonly key: string,
    readonly shiftKey = false,
    readonly ctrlKey = false,
  ) {
    super('keydown', { cancelable: true });
  }
}

function toolOf(selected: string | null): FurnitureTool {
  const floor = floorWith([sofa()]);
  return {
    floor,
    rows: [],
    readOnly: false,
    selected: selected === SOFA_ID ? onlyObject(floor) : null,
    selectedId: selected,
    notice: null,
    notify: vi.fn(),
    specOf,
    nameOf: (): string => 'Sofa',
    roomFlow: idleRoomFlow(),
    place: vi.fn(),
    select: vi.fn(),
    send: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  };
}

function manipulationOf(): Manipulation {
  return {
    gizmo: { owner: SOFA_ID, mode: 'move', space: 'world', snapping: true },
    modes: ['move', 'rotate', 'scale'],
    locked: false,
    overlay: NO_EDIT_OVERLAY,
    notice: null,
    setMode: vi.fn(),
    toggleSnapping: vi.fn(),
    toggleSpace: vi.fn(),
    onEdit: vi.fn(),
  };
}

function historyOf(): EditorHistory {
  return {
    state: { connected: true, status: { kind: 'idle' }, canUndo: true, canRedo: true },
    undo: vi.fn(() => Promise.resolve({ kind: 'saved' } as const)),
    redo: vi.fn(() => Promise.resolve({ kind: 'saved' } as const)),
  };
}

let root: Root | null = null;
let keyboard = new EventTarget();
const frames: FrameRequestCallback[] = [];

function mount(node: ReactNode): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  rerender(node);
}

function rerender(node: ReactNode): void {
  const current = root;
  if (current === null) throw new Error('Editor root did not mount');
  act(() => {
    current.render(node);
  });
}

function press(key: string, shift = false, mod = false): KeyEvent {
  const event = new KeyEvent(key, shift, mod);
  act(() => {
    keyboard.dispatchEvent(event);
  });
  return event;
}

function stage(
  selected: string | null = SOFA_ID,
  active = true,
  history: EditorHistory = historyOf(),
): {
  readonly tool: FurnitureTool;
  readonly manipulation: Manipulation;
  readonly history: EditorHistory;
  readonly menu: () => StageMenu;
  readonly refresh: () => void;
} {
  const tool = toolOf(selected);
  const manipulation = manipulationOf();
  const held: { menu: StageMenu | null } = { menu: null };
  function Probe(): ReactNode {
    held.menu = useStageMenu(tool, manipulation, active, history);
    return null;
  }
  mount(createElement(Probe));
  const menu = (): StageMenu => {
    if (held.menu === null) throw new Error('Stage menu did not mount');
    return held.menu;
  };
  return {
    tool,
    manipulation,
    history,
    menu,
    refresh: (): void => {
      rerender(createElement(Probe));
    },
  };
}

beforeEach(() => {
  keyboard = new EventTarget();
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback): number =>
    frames.push(frame),
  );
  screen.focused = true;
  screen.foreground = true;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'HTMLElement',
    class {
      readonly isContentEditable = false;
      readonly tagName = 'DIV';
    },
  );
  vi.stubGlobal('document', keyboard);
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

describe('the mounted map command pipeline', () => {
  it('routes every gizmo key without sending selection edits', () => {
    const { tool, manipulation } = stage();
    for (const key of ['w', 'e', 'r', 's', 'x']) expect(press(key).defaultPrevented).toBe(true);
    expect(manipulation.setMode).toHaveBeenNthCalledWith(1, 'move');
    expect(manipulation.setMode).toHaveBeenNthCalledWith(2, 'rotate');
    expect(manipulation.setMode).toHaveBeenNthCalledWith(3, 'scale');
    expect(manipulation.toggleSnapping).toHaveBeenCalledTimes(1);
    expect(manipulation.toggleSpace).toHaveBeenCalledTimes(1);
    expect(tool.send).not.toHaveBeenCalled();
  });

  it('routes actions, fine turns and nudges to selection edits exactly once', () => {
    const { tool, history } = stage();
    press('q');
    press('q', true);
    press('ArrowRight');
    press('f');
    press('l', false, true);
    press('d', false, true);
    press('Delete');
    expect(tool.send).toHaveBeenCalledTimes(7);
    expect(tool.send).toHaveBeenNthCalledWith(1, [
      { op: 'update', kind: 'object', floorId: FLOOR_ID, id: SOFA_ID, patch: { rotation: 90 } },
    ]);
    expect(tool.send).toHaveBeenNthCalledWith(2, [
      { op: 'update', kind: 'object', floorId: FLOOR_ID, id: SOFA_ID, patch: { rotation: 15 } },
    ]);
    expect(tool.send).toHaveBeenNthCalledWith(3, [
      { op: 'move', kind: 'object', floorId: FLOOR_ID, id: SOFA_ID, dx: 0.1, dy: 0 },
    ]);
    expect(history.undo).not.toHaveBeenCalled();
    expect(history.redo).not.toHaveBeenCalled();
  });

  it.each([
    { selected: SOFA_ID, active: true },
    { selected: null, active: true },
    { selected: SOFA_ID, active: false },
  ])('routes undo and redo once with selection/tool state %j', ({ selected, active }) => {
    const { tool, history } = stage(selected, active);
    expect(press('z', false, true).defaultPrevented).toBe(true);
    expect(press('z', true, true).defaultPrevented).toBe(true);
    expect(history.undo).toHaveBeenCalledTimes(1);
    expect(history.redo).toHaveBeenCalledTimes(1);
    expect(tool.send).not.toHaveBeenCalled();
  });

  it('opens the keyboard menu at the selection anchor and leaves its arrows to the menu', () => {
    const { menu, tool } = stage();
    act(() => {
      menu().onPointer({ type: 'anchor', seq: 1, rect: { x: 10, y: 20, width: 40, height: 60 } });
    });
    press('ContextMenu');
    expect(menu().layer).not.toBeNull();
    press('ArrowRight');
    expect(tool.send).not.toHaveBeenCalled();
    expect(tool.clear).not.toHaveBeenCalled();
  });

  it('does not consume selection shortcuts without a selection or unrecognized keys', () => {
    stage(null);
    expect(press('w').defaultPrevented).toBe(false);
    expect(press('Delete').defaultPrevented).toBe(false);
    expect(press('unknown').defaultPrevented).toBe(false);
  });

  it('leaves unavailable undo and redo unhandled without sending selection edits', () => {
    const history = historyOf();
    const unavailable = {
      ...history,
      state: { ...history.state, canUndo: false, canRedo: false },
    };
    const { tool } = stage(SOFA_ID, true, unavailable);
    expect(press('z', false, true).defaultPrevented).toBe(false);
    expect(press('z', true, true).defaultPrevented).toBe(false);
    expect(history.undo).not.toHaveBeenCalled();
    expect(history.redo).not.toHaveBeenCalled();
    expect(tool.send).not.toHaveBeenCalled();
  });

  it('keeps the same undo/redo history when wired through the furniture mount', () => {
    const tool = toolOf(null);
    furniture.mockReturnValue(tool);
    const editing = historyOf();
    const map = HOME_MAP_WRITE.parse({
      schemaVersion: 1,
      id: 'home',
      name: 'Test',
      revision: 1,
      north: 0,
      updatedAt: '2026-10-25T00:00:00.000Z',
      floors: [tool.floor],
      sources: [],
      notices: [],
    });
    function Probe(): ReactNode {
      useFurnitureMount({
        map,
        floorId: FLOOR_ID,
        readOnly: false,
        selected: null,
        onSelect: vi.fn(),
        edit: vi.fn(() => Promise.resolve()),
        onClear: vi.fn(),
        roomFlow: idleRoomFlow(),
        commit: vi.fn(),
        selecting: false,
        editing,
      });
      return null;
    }
    mount(createElement(Probe));
    press('z', false, true);
    press('z', true, true);
    expect(editing.undo).toHaveBeenCalledTimes(1);
    expect(editing.redo).toHaveBeenCalledTimes(1);
    expect(tool.send).not.toHaveBeenCalled();
  });
});

describe('map keyboard screen lifetime', () => {
  it.each(['focused', 'foreground'] as const)(
    'stops all shortcuts when %s is lost and restores them',
    (gate) => {
      const { tool, history, manipulation, refresh } = stage();
      screen[gate] = false;
      refresh();
      for (const key of ['z', 'Delete', 'w', 'Escape']) press(key, false, key === 'z');
      press('z', true, true);
      expect(history.undo).not.toHaveBeenCalled();
      expect(history.redo).not.toHaveBeenCalled();
      expect(tool.send).not.toHaveBeenCalled();
      expect(tool.clear).not.toHaveBeenCalled();
      expect(manipulation.setMode).not.toHaveBeenCalled();
      screen[gate] = true;
      refresh();
      press('z', false, true);
      press('q');
      press('w');
      expect(history.undo).toHaveBeenCalledTimes(1);
      expect(tool.send).toHaveBeenCalledTimes(1);
      expect(manipulation.setMode).toHaveBeenCalledTimes(1);
    },
  );

  it('routes only the shown retained editor and restores the first editor after returning', () => {
    const first = { tool: toolOf(SOFA_ID), history: historyOf(), pause: new ScreenPause(null) };
    const second = {
      tool: toolOf(SOFA_ID),
      history: historyOf(),
      pause: new ScreenPause(null, true),
    };
    function Editor({
      tool,
      history,
    }: {
      readonly tool: FurnitureTool;
      readonly history: EditorHistory;
    }): ReactNode {
      useStageMenu(tool, manipulationOf(), false, history);
      return null;
    }
    mount(
      createElement(
        Fragment,
        null,
        createElement(ScreenPausedContext, { value: first.pause }, createElement(Editor, first)),
        createElement(ScreenPausedContext, { value: second.pause }, createElement(Editor, second)),
      ),
    );
    press('z', false, true);
    expect(first.history.undo).toHaveBeenCalledTimes(1);
    expect(second.history.undo).not.toHaveBeenCalled();
    switchEditor(first.pause, second.pause);
    press('z', false, true);
    expect(first.history.undo).toHaveBeenCalledTimes(1);
    expect(second.history.undo).toHaveBeenCalledTimes(1);
    switchEditor(second.pause, first.pause);
    press('z', false, true);
    expect(first.history.undo).toHaveBeenCalledTimes(2);
    expect(second.history.undo).toHaveBeenCalledTimes(1);
    expect(first.tool.send).not.toHaveBeenCalled();
    expect(second.tool.send).not.toHaveBeenCalled();
  });
});

function switchEditor(hidden: ScreenPause, shown: ScreenPause): void {
  act(() => {
    hidden.setOwn(true);
    keyboard.dispatchEvent(new KeyEvent('z', false, true));
    shown.setOwn(false);
    for (const frame of frames.splice(0)) frame(0);
  });
}
