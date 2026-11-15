import type { FrameScheduler } from './frame-loop';
import type { LiveRect } from './renderer-core';

export interface LayoutTarget<Node> {
  readonly element: Node;
  readonly clips: readonly Node[];
}

export interface NodeWatch<Node> {
  readonly observe: (node: Node) => void;
  readonly disconnect: () => void;
}

export interface LayoutWatchHost<Node> {
  readonly targets: () => Iterable<LayoutTarget<Node>>;
  readonly rectOf: (node: Node) => LiveRect;
  readonly scopeOf: (target: LayoutTarget<Node>) => Node;
  readonly chainOf: (target: LayoutTarget<Node>) => Iterable<Node>;
  readonly childrenOf: (node: Node) => Iterable<Node>;
  readonly watchSizes: (onChange: () => void) => NodeWatch<Node>;
  readonly watchStructure: (onChange: () => void) => NodeWatch<Node>;
  readonly watchStyle: (onChange: () => void) => NodeWatch<Node>;
  readonly scheduler: FrameScheduler;
  readonly placementEvents: Set<() => void>;
}

function layoutKey<Node>(host: LayoutWatchHost<Node>): string {
  const parts: string[] = [];
  for (const target of host.targets()) {
    for (const node of [target.element, ...target.clips]) {
      const { x, y, width, height } = host.rectOf(node);
      parts.push(`${String(x)},${String(y)},${String(width)},${String(height)}`);
    }
  }
  return parts.join('|');
}

export function watchLayout<Node>(host: LayoutWatchHost<Node>, onMoved: () => void): () => void {
  let last = layoutKey(host);
  let frame: number | null = null;
  const check = (): void => {
    const next = layoutKey(host);
    if (next === last) return;
    last = next;
    onMoved();
  };
  const onFrame = (): void => {
    frame = null;
    check();
  };
  const nextFrame = (): void => {
    frame ??= host.scheduler.request(onFrame);
  };
  const sizes = host.watchSizes(check);
  const structure = host.watchStructure(nextFrame);
  const styles = host.watchStyle(nextFrame);
  const watches = [sizes, structure, styles];
  const observePlaced = (): void => {
    for (const watch of watches) watch.disconnect();
    for (const target of host.targets()) {
      for (const node of [target.element, ...target.clips]) sizes.observe(node);
      const scope = host.scopeOf(target);
      for (const child of host.childrenOf(scope)) sizes.observe(child);
      structure.observe(scope);
      for (const node of host.chainOf(target)) styles.observe(node);
    }
    last = layoutKey(host);
  };
  host.placementEvents.add(observePlaced);
  observePlaced();
  return (): void => {
    host.placementEvents.delete(observePlaced);
    if (frame !== null) host.scheduler.cancel(frame);
    frame = null;
    for (const watch of watches) watch.disconnect();
  };
}
