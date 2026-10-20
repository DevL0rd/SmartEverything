import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { SceneNode } from '../../model/canvas/contract';
import { isInstance } from './nodes/instance-card';

export const WRAP_KINDS = ['if', 'forEach', 'try', 'parallel', 'repeat', 'while'] as const;

export type WrapKind = (typeof WRAP_KINDS)[number];

const WRAP_LABELS: Readonly<Record<WrapKind, string>> = {
  if: 'If',
  forEach: 'For each',
  try: 'Try',
  parallel: 'Do together',
  repeat: 'Repeat',
  while: 'While',
};

export const MENU_ACTIONS = [
  'edit',
  'renameKey',
  'duplicate',
  'copy',
  'delete',
  'disable',
  'wrapIn',
  'unwrap',
  'makeReusable',
  'openNode',
  'detach',
  'pauseHere',
  'copyReference',
  'freePosition',
  'addComment',
] as const;

export type MenuAction = (typeof MENU_ACTIONS)[number];

export interface MenuChoice {
  readonly action: MenuAction;
  readonly wrap?: WrapKind;
}

export interface MenuItem {
  readonly action: MenuAction;
  readonly label: string;
  readonly destructive: boolean;
}

const EDITABLE: ReadonlySet<SceneNode['role']> = new Set(['trigger', 'step', 'container', 'value']);

const SEQUENCE: ReadonlySet<SceneNode['role']> = new Set(['step', 'container']);

interface Context {
  readonly scene: SceneNode;
  readonly sequence: boolean;
  readonly instance: boolean;
  readonly selectionCount: number;
}

interface Entry {
  readonly action: MenuAction;
  readonly label: (scene: SceneNode) => string;
  readonly destructive?: boolean;
  readonly when?: (context: Context) => boolean;
}

const fixed =
  (text: string): ((scene: SceneNode) => string) =>
  () =>
    text;

const ENTRIES: readonly Entry[] = [
  { action: 'edit', label: fixed('Edit') },
  { action: 'renameKey', label: fixed('Rename key') },
  { action: 'duplicate', label: fixed('Duplicate') },
  { action: 'copy', label: fixed('Copy') },
  { action: 'delete', label: fixed('Delete'), destructive: true },
  { action: 'disable', label: (scene) => (scene.enabled ? 'Disable' : 'Enable') },
  { action: 'wrapIn', label: fixed('Wrap in\u2026'), when: (context) => context.sequence },
  {
    action: 'unwrap',
    label: fixed('Unwrap'),
    when: (context) => context.scene.role === 'container',
  },
  {
    action: 'makeReusable',
    label: fixed('Make Custom Node'),
    when: (context) => context.sequence && context.selectionCount > 0,
  },
  { action: 'openNode', label: fixed('Open node'), when: (context) => context.instance },
  { action: 'detach', label: fixed('Detach'), when: (context) => context.instance },
  { action: 'pauseHere', label: fixed('Pause here'), when: (context) => context.sequence },
  {
    action: 'copyReference',
    label: fixed('Copy reference'),
    when: (context) => context.scene.role !== 'trigger',
  },
  { action: 'freePosition', label: fixed('Free position') },
  { action: 'addComment', label: fixed('Add comment') },
];

export function nodeMenuItems(scene: SceneNode, selectionCount: number): readonly MenuItem[] {
  if (!EDITABLE.has(scene.role)) return [];
  const context: Context = {
    scene,
    sequence: SEQUENCE.has(scene.role),
    instance: isInstance(scene),
    selectionCount,
  };
  return ENTRIES.filter((entry) => entry.when?.(context) ?? true).map((entry) => ({
    action: entry.action,
    label: entry.label(scene),
    destructive: entry.destructive === true,
  }));
}

export function wrapChoices(): readonly { readonly kind: WrapKind; readonly label: string }[] {
  return WRAP_KINDS.map((kind) => ({ kind, label: WRAP_LABELS[kind] }));
}

export const MENU_WIDTH = 224;

export const MENU_ROW = { touch: 44, pointer: 36 } as const;

export function menuHeight(count: number, idiom: 'touch' | 'pointer'): number {
  return count * MENU_ROW[idiom] + 8;
}

export function clampMenu(
  point: { readonly x: number; readonly y: number },
  size: { readonly w: number; readonly h: number },
  bounds: { readonly w: number; readonly h: number },
): { readonly x: number; readonly y: number } {
  const margin = 8;
  const x = Math.max(margin, Math.min(point.x, bounds.w - size.w - margin));
  const y = Math.max(margin, Math.min(point.y, bounds.h - size.h - margin));
  return { x, y };
}

export function stepIndex(current: number, count: number, key: string): number {
  if (count === 0) return 0;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowUp') return (current - 1 + count) % count;
  return current;
}

interface RowEntry {
  readonly key: string;
  readonly label: string;
  readonly destructive: boolean;
  readonly choice: MenuChoice | null;
  readonly expands: boolean;
}

function rowsFor(items: readonly MenuItem[], wrapOpen: boolean): readonly RowEntry[] {
  return items.flatMap((entry): readonly RowEntry[] => {
    const head: RowEntry = {
      key: entry.action,
      label: entry.label,
      destructive: entry.destructive,
      choice: entry.action === 'wrapIn' ? null : { action: entry.action },
      expands: entry.action === 'wrapIn',
    };
    if (entry.action !== 'wrapIn' || !wrapOpen) return [head];
    const wraps = wrapChoices().map((wrap): RowEntry => ({
      key: `wrap:${wrap.kind}`,
      label: wrap.label,
      destructive: false,
      choice: { action: 'wrapIn', wrap: wrap.kind },
      expands: false,
    }));
    return [head, ...wraps];
  });
}

export interface NodeContextMenuProps {
  readonly scene: SceneNode;
  readonly selectionCount: number;
  readonly idiom: 'touch' | 'pointer';
  readonly point: { readonly x: number; readonly y: number };
  readonly bounds: { readonly w: number; readonly h: number };
  readonly onChoose: (choice: MenuChoice) => void;
  readonly onClose: () => void;
}

function menuStyle(place: { readonly x: number; readonly y: number }): CSSProperties {
  return { left: place.x, top: place.y, width: MENU_WIDTH };
}

function useActiveFocus(
  list: RefObject<HTMLDivElement | null>,
  active: number,
  open: boolean,
): void {
  useEffect(() => {
    list.current?.querySelector<HTMLButtonElement>('[data-active="true"]')?.focus();
  }, [list, active, open]);
}

function useOutsideClose(list: RefObject<HTMLDivElement | null>, onClose: () => void): void {
  useEffect(() => {
    const away = (event: PointerEvent): void => {
      const { target } = event;
      if (!(target instanceof Node) || list.current?.contains(target) !== true) onClose();
    };
    document.addEventListener('pointerdown', away, true);
    return (): void => {
      document.removeEventListener('pointerdown', away, true);
    };
  }, [list, onClose]);
}

function MenuRows({
  rows,
  active,
  wrapOpen,
  onPick,
  onHover,
}: {
  readonly rows: readonly RowEntry[];
  readonly active: number;
  readonly wrapOpen: boolean;
  readonly onPick: (row: RowEntry) => void;
  readonly onHover: (index: number) => void;
}): ReactNode {
  return rows.map((row, index) => (
    <button
      key={row.key}
      type="button"
      role="menuitem"
      className="sn-menu-row"
      data-active={index === active}
      data-destructive={row.destructive}
      data-nested={row.key.startsWith('wrap:')}
      aria-haspopup={row.expands ? 'menu' : undefined}
      aria-expanded={row.expands ? wrapOpen : undefined}
      tabIndex={index === active ? 0 : -1}
      onClick={() => {
        onPick(row);
      }}
      onPointerEnter={() => {
        onHover(index);
      }}
    >
      {row.label}
    </button>
  ));
}

export function NodeContextMenu(props: NodeContextMenuProps): ReactNode {
  const { scene, selectionCount, idiom, point, bounds, onChoose, onClose } = props;
  const items = nodeMenuItems(scene, selectionCount);
  const [wrapOpen, setWrapOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const rows = rowsFor(items, wrapOpen);
  const place = clampMenu(point, { w: MENU_WIDTH, h: menuHeight(rows.length, idiom) }, bounds);
  useActiveFocus(list, active, wrapOpen);
  useOutsideClose(list, onClose);
  if (items.length === 0) return null;
  const pick = (row: RowEntry): void => {
    if (row.expands) {
      setWrapOpen((open) => !open);
      return;
    }
    if (row.choice !== null) onChoose(row.choice);
    onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    const next = stepIndex(active, rows.length, event.key);
    if (next !== active || event.key.startsWith('Arrow')) {
      event.preventDefault();
      setActive(next);
    }
  };
  return (
    <div
      ref={list}
      className="sn-menu"
      role="menu"
      tabIndex={-1}
      aria-label={`Actions for ${scene.title}`}
      data-idiom={idiom}
      style={menuStyle(place)}
      onKeyDown={onKeyDown}
    >
      <MenuRows rows={rows} active={active} wrapOpen={wrapOpen} onPick={pick} onHover={setActive} />
    </div>
  );
}
