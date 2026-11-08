import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { floorWith, onlyObject, sofa } from '../tools/furniture-fixture';
import { objectActions, type ObjectAction } from './object-actions';

interface Props {
  readonly children?: ReactNode;
  readonly label?: unknown;
  readonly accessibilityRole?: unknown;
  readonly accessibilityLabel?: unknown;
  readonly [key: string]: unknown;
}

const pressed = vi.hoisted(() => new Map<string, Props>());
const roles = vi.hoisted(() => new Map<string, string>());

function Pressable(props: Props): ReactNode {
  const { label } = props;
  if (typeof label === 'string') pressed.set(label, props);
  return props.children ?? null;
}

function Box(props: Props): ReactNode {
  const { accessibilityRole: role, accessibilityLabel: label } = props;
  if (typeof role === 'string' && typeof label === 'string') roles.set(label, role);
  return typeof props.children === 'string' ? null : (props.children ?? null);
}

const none = (): null => null;

vi.mock('react-native', () => ({ View: Box, ScrollView: Box }));
vi.mock('react-native-reanimated', () => ({
  default: { View: Box },
  FadeIn: { duration: (): object => ({}) },
}));
vi.mock('react-native-gesture-handler', () => ({ Gesture: {}, GestureDetector: Box }));
vi.mock('react-native-svg', () => ({ default: Box, Circle: none, G: Box, Path: none }));
vi.mock('../../../../design/size-class', () => ({ useIsPhone: (): boolean => true }));
vi.mock('../tools/walls-openings', () => ({
  wallsOpeningsDrag: vi.fn(),
  wallsOpeningsTap: vi.fn(),
}));
vi.mock('../tool-state', () => ({ editorCanvasLabel: (): string => 'Map' }));
vi.mock('../../../../components/icon', () => ({ Icon: none }));
vi.mock('../../../../components/text', () => ({ Text: Box }));
vi.mock('../../../../components/interactive', () => ({ Interactive: Pressable }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: Pressable }));
vi.mock('../../../../platform/haptics', () => ({ selectionTick: vi.fn() }));
vi.mock('../../../../design/motion', () => ({
  useMotion: (): object => ({ reduced: true }),
  entering: (): object => ({}),
}));
vi.mock('../../../../design/animation-gate', () => ({
  useScreenLive: (): { focused: boolean; foreground: boolean } => ({
    focused: true,
    foreground: true,
  }),
}));
vi.mock('../../../../design/platform', () => ({
  isNative: (): boolean => true,
  useIdiom: (): string => 'pointer',
}));

const { ObjectContextMenu } = await import('./context-menu');
const { CLEAR_LABEL, ContextualBar, MORE_LABEL } = await import('./contextual-bar');
const { MENU_START, MENU_WIDTH_PX, menuKey, placeMenu, placeSubmenu } =
  await import('./menu-model');
const { panelTop, selectionSurface } = await import('../docked-panel');

const STAGE = { width: 800, height: 600 };
const SIZE = { width: 252, height: 300 };
const sofaActions = (surface: 'menu' | 'bar'): readonly ObjectAction[] =>
  objectActions({ kind: 'object', object: onlyObject(floorWith([sofa()])) }, surface, false);
const ROOMS = [
  { key: 'kitchen', label: 'Kitchen', on: false },
  { key: 'hall', label: 'Hallway', on: true },
];
const LOOKS = [{ key: 'finish:slate', label: 'Slate', on: false }];

let root: Root | null = null;

function press(label: string): void {
  const handler = pressed.get(label)?.['onPress'];
  if (typeof handler !== 'function') throw new Error(`no ${label}`);
  act(() => {
    Reflect.apply(handler, undefined, []);
  });
}

function mount(node: ReactNode): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const current = root;
  act(() => {
    current.render(node);
  });
}

beforeEach(() => {
  pressed.clear();
  roles.clear();
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

describe('menu placement', () => {
  it('opens beside the object and flips to the other side near the edge, never covering it', () => {
    const object = { x: 100, y: 200, width: 80, height: 60 };
    expect(placeMenu(object, SIZE, STAGE).x).toBe(192);
    const right = { x: 600, y: 200, width: 120, height: 60 };
    const flipped = placeMenu(right, SIZE, STAGE);
    expect(flipped.x + flipped.width).toBeLessThanOrEqual(right.x);
    const wide = { x: 30, y: 20, width: 740, height: 200 };
    const below = placeMenu(wide, SIZE, STAGE);
    expect(below.y).toBeGreaterThanOrEqual(wide.y + wide.height);
  });

  it('puts the submenu beside the menu and away from the object', () => {
    const object = { x: 100, y: 200, width: 80, height: 60 };
    const menu = placeMenu(object, SIZE, STAGE);
    const sub = placeSubmenu(
      { menu, rowY: menu.y + 150, object },
      { width: 200, height: 100 },
      STAGE,
    );
    expect(sub.x).toBe(menu.x + menu.width + 12);
    const late = { ...menu, x: 560 };
    const left = placeSubmenu(
      { menu: late, rowY: 200, object },
      { width: 200, height: 100 },
      STAGE,
    );
    expect(left.x + left.width).toBeLessThanOrEqual(late.x);
  });
});

describe('menu keyboard', () => {
  const actions = sofaActions('menu');
  const count = (): number => ROOMS.length;

  it('moves with the arrows, wraps, opens a submenu with the right arrow and activates with Enter', () => {
    const up = menuKey(MENU_START, 'ArrowUp', actions, count);
    expect(up.focus.index).toBe(actions.length - 1);
    expect(menuKey(up.focus, 'Enter', actions, count).effect).toEqual({
      kind: 'action',
      id: 'delete',
    });
    const onMove = { ...MENU_START, index: 4 };
    const opened = menuKey(onMove, 'ArrowRight', actions, count);
    expect(opened.focus.sub).toBe('move');
    const down = menuKey(opened.focus, 'ArrowDown', actions, count);
    expect(menuKey(down.focus, 'Enter', actions, count).effect).toEqual({
      kind: 'choose',
      sub: 'move',
      index: 1,
    });
    expect(menuKey(down.focus, 'ArrowLeft', actions, count).focus.sub).toBeNull();
    expect(menuKey(MENU_START, 'Escape', actions, count).effect).toEqual({ kind: 'close' });
  });
});

describe('context menu', () => {
  it('is a labelled menu whose items run the action and close it', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    mount(
      createElement(ObjectContextMenu, {
        title: 'Sofa',
        gizmo: null,
        locked: false,
        object: { x: 100, y: 200, width: 80, height: 60 },
        stage: STAGE,
        actions: sofaActions('menu'),
        rooms: ROOMS,
        looks: LOOKS,
        onAction,
        onRoom: vi.fn(),
        onLook: vi.fn(),
        onClose,
      }),
    );
    expect(roles.get('Sofa')).toBe('menu');
    expect(pressed.get('Delete')?.['role']).toBe('menuitem');
    press('Flip');
    expect(onAction).toHaveBeenCalledWith('flip');
    expect(onClose).toHaveBeenCalled();
  });

  it('opens the room list beside the menu and moves the object there', () => {
    const onRoom = vi.fn();
    mount(
      createElement(ObjectContextMenu, {
        title: 'Sofa',
        gizmo: null,
        locked: false,
        object: { x: 100, y: 200, width: 80, height: 60 },
        stage: STAGE,
        actions: sofaActions('menu'),
        rooms: ROOMS,
        looks: LOOKS,
        onAction: vi.fn(),
        onRoom,
        onLook: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    press('Move to another room');
    expect(roles.get('Move to another room')).toBe('menu');
    press('Kitchen');
    expect(onRoom).toHaveBeenCalledWith('kitchen');
  });
});

function gizmoOf(onMode = vi.fn()): {
  readonly mode: 'move';
  readonly modes: readonly ('move' | 'rotate' | 'scale')[];
  readonly space: 'local' | 'world';
  readonly snapping: boolean;
  readonly disabled: boolean;
  readonly onMode: typeof onMode;
  readonly onSnapping: () => void;
  readonly onSpace: () => void;
} {
  return {
    mode: 'move',
    modes: ['move', 'rotate'],
    space: 'world',
    snapping: true,
    disabled: false,
    onMode,
    onSnapping: vi.fn(),
    onSpace: vi.fn(),
  };
}

describe('context menu mode row', () => {
  it('repeats Move, Rotate and Scale at the top of the 264 px menu and switches the mode', () => {
    const onMode = vi.fn();
    const onClose = vi.fn();
    mount(
      createElement(ObjectContextMenu, {
        title: 'Sofa',
        gizmo: { mode: 'move', modes: ['move', 'rotate'], space: 'local', onMode },
        locked: false,
        object: { x: 100, y: 200, width: 80, height: 60 },
        stage: STAGE,
        actions: sofaActions('menu'),
        rooms: ROOMS,
        looks: LOOKS,
        onAction: vi.fn(),
        onRoom: vi.fn(),
        onLook: vi.fn(),
        onClose,
      }),
    );
    expect(MENU_WIDTH_PX).toBe(264);
    expect(roles.get('Gizmo mode')).toBe('radiogroup');
    expect(pressed.get('Move')?.['selected']).toBe(true);
    expect(pressed.get('Scale')?.['disabled']).toBe(true);
    press('Rotate');
    expect(onMode).toHaveBeenCalledWith('rotate');
  });

  it('shows Unlock as the one amber action of a locked item and drops the mode row', () => {
    const locked = objectActions(
      { kind: 'object', object: onlyObject(floorWith([sofa(true)])) },
      'menu',
      false,
    );
    mount(
      createElement(ObjectContextMenu, {
        title: 'Sofa',
        gizmo: null,
        locked: true,
        object: { x: 100, y: 200, width: 80, height: 60 },
        stage: STAGE,
        actions: locked,
        rooms: ROOMS,
        looks: LOOKS,
        onAction: vi.fn(),
        onRoom: vi.fn(),
        onLook: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const amber = [...pressed.entries()].filter(([, props]) =>
      String(props['className']).includes('bg-primary-container'),
    );
    expect(amber.map(([label]) => label)).toEqual(['Unlock position']);
    expect(roles.has('Gizmo mode')).toBe(false);
  });

  it('keeps the old action order in the menu', () => {
    expect(sofaActions('menu').map((action) => action.id)).toEqual([
      'rotate',
      'flip',
      'duplicate',
      'style',
      'move',
      'lock',
      'delete',
    ]);
  });
});

describe('contextual bar', () => {
  function bar(gizmo = gizmoOf(), onAction = vi.fn(), onLook = vi.fn(), onClear = vi.fn()): void {
    mount(
      createElement(ContextualBar, {
        title: 'Sofa',
        locked: false,
        gizmo,
        actions: sofaActions('bar'),
        rooms: ROOMS,
        looks: LOOKS,
        onAction,
        onRoom: vi.fn(),
        onLook,
        onClear,
      }),
    );
  }

  it('is one toolbar row of clear, the mode switch, snapping and More', () => {
    const onClear = vi.fn();
    const gizmo = gizmoOf();
    bar(gizmo, vi.fn(), vi.fn(), onClear);
    expect(roles.get('Actions for Sofa')).toBe('toolbar');
    expect(pressed.get('Move, world axes')?.['selected']).toBe(true);
    expect(pressed.get('Scale')?.['disabled']).toBe(true);
    expect(pressed.get('Snapping')?.['selected']).toBe(true);
    press('Snapping');
    expect(gizmo.onSnapping).toHaveBeenCalled();
    press(CLEAR_LABEL);
    expect(onClear).toHaveBeenCalled();
    expect(pressed.has('Flip')).toBe(false);
  });

  it('opens the action list under More with the axes first and runs the actions', () => {
    const onAction = vi.fn();
    const onLook = vi.fn();
    const gizmo = gizmoOf();
    bar(gizmo, onAction, onLook);
    press(MORE_LABEL);
    expect(pressed.get(MORE_LABEL)?.['expanded']).toBe(true);
    expect(roles.get('More for Sofa')).toBe('menu');
    press('Axes: World');
    expect(gizmo.onSpace).toHaveBeenCalled();
    press('Turn 90°');
    expect(onAction).toHaveBeenCalledWith('rotate');
    press('Style ›');
    press('Slate');
    expect(onLook).toHaveBeenCalledWith('finish:slate');
  });

  it('disables the mode switch and snapping when the item cannot be moved', () => {
    bar({ ...gizmoOf(), disabled: true });
    expect(pressed.get('Move, world axes')?.['disabled']).toBe(true);
    expect(pressed.get('Snapping')?.['disabled']).toBe(true);
  });
});

describe('docked panel top', () => {
  it('shows the contextual bar instead of the tool row on phones only', () => {
    expect(selectionSurface('bottom')).toBe('bar');
    expect(selectionSurface('side')).toBe('menu');
    expect(panelTop('bottom', 'tools', 'bar')).toBe('bar');
    expect(panelTop('bottom', 'tools', null)).toBe('tools');
    expect(panelTop('side', 'tools', 'bar')).toBe('tools');
  });
});
