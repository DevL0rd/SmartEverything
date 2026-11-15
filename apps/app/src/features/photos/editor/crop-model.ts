import type { PhotoBox } from '@smarteverything/domain';

export const ASPECTS = ['free', 'original', 'square', '4:3', '3:4', '16:9', '9:16'] as const;

export type Aspect = (typeof ASPECTS)[number];

export const ASPECT_LABELS: Readonly<Record<Aspect, string>> = {
  free: 'Free',
  original: 'Original',
  square: 'Square',
  '4:3': '4:3',
  '3:4': '3:4',
  '16:9': '16:9',
  '9:16': '9:16',
};

const RATIOS: Readonly<Record<Exclude<Aspect, 'free' | 'original'>, number>> = {
  square: 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
};

export const WHOLE: PhotoBox = { x: 0, y: 0, w: 1, h: 1 };

export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: readonly Exclude<Handle, 'move'>[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

export interface Frame {
  readonly width: number;
  readonly height: number;
}

export function ratioOf(aspect: Aspect, imageRatio: number): number | null {
  if (aspect === 'free') return null;
  return aspect === 'original' ? imageRatio : RATIOS[aspect];
}

export function presetBox(ratio: number, imageRatio: number): PhotoBox {
  const share = ratio / imageRatio;
  const w = share >= 1 ? 1 : share;
  const h = share >= 1 ? 1 / share : 1;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

interface Edges {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function edgesOf(box: PhotoBox): Edges {
  return { left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + box.h };
}

function boxOf(edges: Edges): PhotoBox {
  return {
    x: edges.left,
    y: edges.top,
    w: edges.right - edges.left,
    h: edges.bottom - edges.top,
  };
}

function moved(box: PhotoBox, dx: number, dy: number): PhotoBox {
  return { ...box, x: clamp(box.x + dx, 0, 1 - box.w), y: clamp(box.y + dy, 0, 1 - box.h) };
}

function freeEdges(start: Edges, drag: CropDrag): Edges {
  const { handle, dx, dy, min } = drag;
  const left = handle.includes('w')
    ? clamp(start.left + dx, 0, start.right - min.width)
    : start.left;
  const right = handle.includes('e')
    ? clamp(start.right + dx, start.left + min.width, 1)
    : start.right;
  const top = handle.includes('n')
    ? clamp(start.top + dy, 0, start.bottom - min.height)
    : start.top;
  const bottom = handle.includes('s')
    ? clamp(start.bottom + dy, start.top + min.height, 1)
    : start.bottom;
  return { left, top, right, bottom };
}

function anchorOf(start: Edges, handle: Handle): { readonly x: number; readonly y: number } {
  const x = handle.includes('w')
    ? start.right
    : handle.includes('e')
      ? start.left
      : (start.left + start.right) / 2;
  const y = handle.includes('n')
    ? start.bottom
    : handle.includes('s')
      ? start.top
      : (start.top + start.bottom) / 2;
  return { x, y };
}

function room(anchor: number, toward: number | null): number {
  if (toward === null) return 2 * Math.min(anchor, 1 - anchor);
  return toward < 0 ? anchor : 1 - anchor;
}

function direction(handle: Handle, negative: string, positive: string): number | null {
  if (handle.includes(negative)) return -1;
  return handle.includes(positive) ? 1 : null;
}

function lockedEdges(start: Edges, handle: Handle, free: Edges, share: number): Edges {
  const anchor = anchorOf(start, handle);
  const dirX = direction(handle, 'w', 'e');
  const dirY = direction(handle, 'n', 's');
  const wanted = Math.max(
    dirX === null ? 0 : free.right - free.left,
    dirY === null ? 0 : (free.bottom - free.top) * share,
  );
  const width = Math.min(wanted, room(anchor.x, dirX), room(anchor.y, dirY) * share);
  const height = width / share;
  const left = dirX === null ? anchor.x - width / 2 : dirX < 0 ? anchor.x - width : anchor.x;
  const top = dirY === null ? anchor.y - height / 2 : dirY < 0 ? anchor.y - height : anchor.y;
  return { left, top, right: left + width, bottom: top + height };
}

export interface CropDrag {
  readonly start: PhotoBox;
  readonly handle: Handle;
  readonly dx: number;
  readonly dy: number;
  readonly min: Frame;
  readonly share: number | null;
}

export function dragged(drag: CropDrag): PhotoBox {
  if (drag.handle === 'move') return moved(drag.start, drag.dx, drag.dy);
  const start = edgesOf(drag.start);
  const free = freeEdges(start, drag);
  return boxOf(drag.share === null ? free : lockedEdges(start, drag.handle, free, drag.share));
}

export function minimumOf(handlePx: number, shown: Frame): Frame {
  return {
    width: Math.min(1, (2 * handlePx) / Math.max(1, shown.width)),
    height: Math.min(1, (2 * handlePx) / Math.max(1, shown.height)),
  };
}
