import type { ObjectAction, ObjectActionId } from './object-actions';

export interface StageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StageSize {
  readonly width: number;
  readonly height: number;
}

export interface SubChoice {
  readonly key: string;
  readonly label: string;
  readonly on: boolean;
}

export type SubmenuId = Extract<ObjectActionId, 'style' | 'move'>;

const SUBMENU_WIDTH_PX = { pointer: 200, touch: 232 } as const;
export const MENU_WIDTH_PX = 264;
export const MENU_GAP_PX = 12;
export const MENU_MARGIN_PX = 8;
export const MENU_PAD_PX = 4;
export const DIVIDER_PX = 9;
export const MODE_ROW_PX = 58;

export function menuRowPx(touch: boolean): number {
  return touch ? 44 : 36;
}

export function submenuWidthPx(touch: boolean): number {
  return touch ? SUBMENU_WIDTH_PX.touch : SUBMENU_WIDTH_PX.pointer;
}

export interface MenuShape {
  readonly rows: number;
  readonly dividers: number;
  readonly header: number;
}

export function menuHeight(shape: MenuShape, touch: boolean): number {
  return (
    shape.header + shape.rows * menuRowPx(touch) + shape.dividers * DIVIDER_PX + MENU_PAD_PX * 2
  );
}

export function modeRowHeight(shown: boolean): number {
  return shown ? MODE_ROW_PX + DIVIDER_PX : 0;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function inside(rect: StageRect, stage: StageSize): boolean {
  return (
    rect.x >= MENU_MARGIN_PX &&
    rect.y >= MENU_MARGIN_PX &&
    rect.x + rect.width <= stage.width - MENU_MARGIN_PX &&
    rect.y + rect.height <= stage.height - MENU_MARGIN_PX
  );
}

function crosses(a: StageRect, b: StageRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function candidates(
  near: StageRect,
  size: StageSize,
  stage: StageSize,
  alignY: number,
): StageRect[] {
  const y = clamp(alignY, MENU_MARGIN_PX, stage.height - MENU_MARGIN_PX - size.height);
  const x = clamp(
    near.x + near.width / 2 - size.width / 2,
    MENU_MARGIN_PX,
    stage.width - MENU_MARGIN_PX - size.width,
  );
  return [
    { x: near.x + near.width + MENU_GAP_PX, y, ...size },
    { x: near.x - MENU_GAP_PX - size.width, y, ...size },
    { x, y: near.y + near.height + MENU_GAP_PX, ...size },
    { x, y: near.y - MENU_GAP_PX - size.height, ...size },
  ];
}

function settle(
  options: readonly StageRect[],
  avoid: readonly StageRect[],
  stage: StageSize,
): StageRect {
  const free = options.find(
    (rect) => inside(rect, stage) && avoid.every((other) => !crosses(rect, other)),
  );
  if (free !== undefined) return free;
  const fallback = options[0] ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    ...fallback,
    x: clamp(fallback.x, MENU_MARGIN_PX, stage.width - MENU_MARGIN_PX - fallback.width),
    y: clamp(fallback.y, MENU_MARGIN_PX, stage.height - MENU_MARGIN_PX - fallback.height),
  };
}

export function placeMenu(object: StageRect, size: StageSize, stage: StageSize): StageRect {
  const alignY = object.y + object.height / 2 - size.height / 2;
  return settle(candidates(object, size, stage, alignY), [object], stage);
}

export interface SubmenuAt {
  readonly menu: StageRect;
  readonly rowY: number;
  readonly object: StageRect;
}

export function placeSubmenu(at: SubmenuAt, size: StageSize, stage: StageSize): StageRect {
  return settle(candidates(at.menu, size, stage, at.rowY), [at.object, at.menu], stage);
}

export interface MenuFocus {
  readonly index: number;
  readonly sub: SubmenuId | null;
  readonly subIndex: number;
}

export type MenuEffect =
  | { readonly kind: 'none' }
  | { readonly kind: 'close' }
  | { readonly kind: 'action'; readonly id: ObjectActionId }
  | { readonly kind: 'choose'; readonly sub: SubmenuId; readonly index: number };

export interface MenuStep {
  readonly focus: MenuFocus;
  readonly effect: MenuEffect;
}

export const MENU_START: MenuFocus = { index: 0, sub: null, subIndex: 0 };

const NONE: MenuEffect = { kind: 'none' };

function wrap(index: number, count: number): number {
  return count === 0 ? 0 : (index + count) % count;
}

export function subOf(action: ObjectAction | undefined): SubmenuId | null {
  return action?.id === 'style' || action?.id === 'move' ? action.id : null;
}

function subKey(focus: MenuFocus, key: string, sub: SubmenuId, count: number): MenuStep {
  const move = (by: number): MenuStep => ({
    focus: { ...focus, subIndex: wrap(focus.subIndex + by, count) },
    effect: NONE,
  });
  if (key === 'ArrowDown') return move(1);
  if (key === 'ArrowUp') return move(-1);
  if (key === 'ArrowLeft' || key === 'Escape')
    return { focus: { ...focus, sub: null }, effect: NONE };
  if (key === 'Enter' || key === ' ') {
    return { focus, effect: { kind: 'choose', sub, index: focus.subIndex } };
  }
  return { focus, effect: NONE };
}

function activate(focus: MenuFocus, action: ObjectAction | undefined): MenuStep {
  if (action === undefined || action.disabled) return { focus, effect: NONE };
  const sub = subOf(action);
  if (sub !== null) return { focus: { ...focus, sub, subIndex: 0 }, effect: NONE };
  return { focus, effect: { kind: 'action', id: action.id } };
}

function navIndex(key: string, index: number, count: number): number | null {
  const steps: Readonly<Record<string, number>> = {
    ArrowDown: index + 1,
    ArrowUp: index - 1,
    Home: 0,
    End: count - 1,
  };
  return steps[key] ?? null;
}

export function menuKey(
  focus: MenuFocus,
  key: string,
  actions: readonly ObjectAction[],
  subCount: (sub: SubmenuId) => number,
): MenuStep {
  if (focus.sub !== null) return subKey(focus, key, focus.sub, subCount(focus.sub));
  const current = actions[focus.index];
  const target = navIndex(key, focus.index, actions.length);
  if (target !== null)
    return { focus: { ...focus, index: wrap(target, actions.length) }, effect: NONE };
  if (key === 'Escape') return { focus, effect: { kind: 'close' } };
  if (key === 'Enter' || key === ' ') return activate(focus, current);
  if (key === 'ArrowRight' && subOf(current) !== null) return activate(focus, current);
  return { focus, effect: NONE };
}
