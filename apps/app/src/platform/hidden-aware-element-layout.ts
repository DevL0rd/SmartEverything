import { use, useLayoutEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { ScreenPausedContext } from '../design/screen-pause';

interface Layout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

interface LayoutEvent {
  readonly nativeEvent: { readonly layout: Layout; readonly target: Element };
  readonly timeStamp: number;
}

type LayoutHandler = (event: LayoutEvent) => void;

interface Tracked {
  handler: LayoutHandler;
  paused: boolean;
  last: Layout | null;
}

const SETTLE_PASSES = 4;

const tracked = new WeakMap<Element, Tracked>();

const observed = new Set<Element>();

let settling = false;

function pageOffsets(node: HTMLElement): { readonly left: number; readonly top: number } {
  let left = node.offsetLeft;
  let top = node.offsetTop;
  let ancestor = node.offsetParent;
  while (ancestor instanceof HTMLElement) {
    left += ancestor.offsetLeft + ancestor.clientLeft - ancestor.scrollLeft;
    top += ancestor.offsetTop + ancestor.clientTop - ancestor.scrollTop;
    ancestor = ancestor.offsetParent;
  }
  return { left: left - window.scrollX, top: top - window.scrollY };
}

function layoutOf(node: HTMLElement): Layout | null {
  const parent = node.parentNode;
  if (!(parent instanceof HTMLElement)) {
    return null;
  }
  const own = pageOffsets(node);
  const around = pageOffsets(parent);
  return {
    x: own.left - around.left,
    y: own.top - around.top,
    width: node.offsetWidth,
    height: node.offsetHeight,
    left: own.left,
    top: own.top,
  };
}

function sameLayout(left: Layout, right: Layout): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.left === right.left &&
    left.top === right.top
  );
}

function isRendered(node: HTMLElement): boolean {
  return node.isConnected && node.getClientRects().length > 0;
}

function trackedLayout(node: Element): { readonly entry: Tracked; readonly layout: Layout } | null {
  const entry = tracked.get(node);
  if (entry === undefined || entry.paused || !(node instanceof HTMLElement) || !isRendered(node)) {
    return null;
  }
  const layout = layoutOf(node);
  return layout === null ? null : { entry, layout };
}

function deliver(node: Element, first: boolean): boolean {
  const found = trackedLayout(node);
  if (found === null) {
    return false;
  }
  const { entry, layout } = found;
  const unchanged = entry.last !== null && sameLayout(entry.last, layout);
  const empty = first && layout.width === 0 && layout.height === 0;
  if (unchanged || empty) {
    return false;
  }
  entry.last = layout;
  entry.handler({ nativeEvent: { layout, target: node }, timeStamp: Date.now() });
  return true;
}

function deliverAll(): boolean {
  let delivered = false;
  for (const node of observed) {
    delivered = deliver(node, false) || delivered;
  }
  return delivered;
}

function settle(): void {
  settling = false;
  for (let pass = 0; pass < SETTLE_PASSES; pass += 1) {
    if (!flushSync(deliverAll)) {
      return;
    }
  }
}

function settleAfterCommit(): void {
  if (!settling) {
    settling = true;
    queueMicrotask(settle);
  }
}

const observer =
  typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          deliver(entry.target, false);
        }
      })
    : null;

export default function useElementLayout(
  ref: RefObject<HTMLElement | null>,
  onLayout: LayoutHandler | undefined,
): void {
  const watching = onLayout !== undefined;
  const paused = watching ? use(ScreenPausedContext) : false;
  const wasPaused = useRef(paused);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || onLayout === undefined) {
      return;
    }
    const entry = tracked.get(node) ?? { handler: onLayout, paused, last: null };
    entry.handler = onLayout;
    entry.paused = paused;
    tracked.set(node, entry);
    if (!paused && (wasPaused.current || entry.last === null)) {
      if (deliver(node, true) && wasPaused.current) {
        settleAfterCommit();
      }
    }
    wasPaused.current = paused;
  });
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || observer === null || !watching) {
      return undefined;
    }
    observer.observe(node);
    observed.add(node);
    return (): void => {
      observer.unobserve(node);
      observed.delete(node);
      tracked.delete(node);
    };
  }, [ref, watching]);
}
