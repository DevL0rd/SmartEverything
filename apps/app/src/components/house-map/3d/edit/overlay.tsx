import { useCallback, type ReactNode } from 'react';
import type { LoupePlacement } from '../render-core-loupe';
import {
  NO_YIELD,
  type Disc,
  type DrawnHandle,
  type DrawnPath,
  type DrawnPill,
  type OverlayScene,
} from './overlay-model';

const SVG_NS = 'http://www.w3.org/2000/svg';

const DIAMOND_SCALE = Math.SQRT1_2;

const ARROW_SPREAD = 0.42;

const PULSE_RINGS_PX = [38, 52] as const;

const LOUPE_RIM_PX = 2;

const CROSS_GAP_PX = 6;

const CROSS_ARM_PX = 18;

const EMPTY_SCENE: OverlayScene = {
  handles: [],
  paths: [],
  pills: [],
  pulse: null,
  touches: [],
  cursor: null,
  yieldTo: NO_YIELD,
};

type Shape = 'arrow' | 'square' | 'diamond' | 'round';

const SHAPES: Readonly<Record<DrawnHandle['kind'], Shape>> = {
  'axis-x': 'arrow',
  'axis-y': 'arrow',
  'axis-z': 'arrow',
  plane: 'square',
  corner: 'square',
  top: 'square',
  side: 'diamond',
  edge: 'diamond',
  ring: 'round',
  uniform: 'round',
  point: 'round',
  'cone-yaw': 'round',
  'cone-pitch': 'round',
};

function round(value: number): string {
  return value.toFixed(1);
}

function shapePath(shape: Shape, size: number): string {
  const half = size / 2;
  switch (shape) {
    case 'arrow':
      return `M${round(half)} 0 L${round(-half)} ${round(-size * ARROW_SPREAD)} L${round(-half)} ${round(size * ARROW_SPREAD)} Z`;
    case 'square':
      return `M${round(-half)} ${round(-half)} H${round(half)} V${round(half)} H${round(-half)} Z`;
    case 'diamond': {
      const reach = size * DIAMOND_SCALE;
      return `M0 ${round(-reach)} L${round(reach)} 0 L0 ${round(reach)} L${round(-reach)} 0 Z`;
    }
    case 'round':
      return `M${round(-half)} 0 A${round(half)} ${round(half)} 0 1 0 ${round(half)} 0 A${round(half)} ${round(half)} 0 1 0 ${round(-half)} 0 Z`;
  }
}

function svgNode<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function attrs(node: Element, values: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(values)) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
}

class Keyed<T extends Element> {
  private readonly nodes = new Map<string, T>();

  constructor(
    private readonly parent: Element,
    private readonly create: () => T,
  ) {}

  sync(keys: readonly string[], update: (node: T, index: number) => void): void {
    const wanted = new Set(keys);
    for (const [key, node] of this.nodes) {
      if (wanted.has(key)) continue;
      node.remove();
      this.nodes.delete(key);
    }
    keys.forEach((key, index) => {
      let node = this.nodes.get(key);
      if (node === undefined) {
        node = this.create();
        this.nodes.set(key, node);
      }
      if (this.parent.children.item(index) !== node) {
        this.parent.insertBefore(node, this.parent.children.item(index));
      }
      update(node, index);
    });
  }
}

function pathGroup(): SVGGElement {
  const group = svgNode('g');
  const halo = svgNode('path');
  halo.setAttribute('class', 'map3d-edit-halo');
  const line = svgNode('path');
  line.setAttribute('class', 'map3d-edit-line');
  group.append(halo, line);
  return group;
}

function handleGroup(): SVGGElement {
  const group = svgNode('g');
  group.setAttribute('class', 'map3d-edit-handle');
  group.setAttribute('role', 'img');
  const target = svgNode('rect');
  target.setAttribute('class', 'map3d-edit-target');
  const halo = svgNode('path');
  halo.setAttribute('class', 'map3d-edit-halo');
  const body = svgNode('path');
  body.setAttribute('class', 'map3d-edit-body');
  group.append(target, halo, body);
  return group;
}

function drawPath(group: Element, path: DrawnPath): void {
  attrs(group, {
    class: 'map3d-edit-path',
    'data-look': path.look,
    'data-tone': path.tone ?? 'none',
    'data-state': path.state,
  });
  for (const child of Array.from(group.children)) attrs(child, { d: path.d });
}

function drawHandle(group: Element, handle: DrawnHandle): void {
  const turn = handle.angle === 0 ? '' : ` rotate(${round(handle.angle)})`;
  attrs(group, {
    'data-handle': handle.id,
    'data-kind': handle.kind,
    'data-state': handle.state,
    'aria-label': handle.label,
    transform: `translate(${round(handle.x)} ${round(handle.y)})${turn}`,
  });
  const [target, halo, body] = Array.from(group.children);
  const half = round(-handle.target / 2);
  if (target !== undefined) {
    const side = round(handle.target);
    attrs(target, { x: half, y: half, width: side, height: side });
  }
  const d = shapePath(SHAPES[handle.kind], handle.size);
  if (halo !== undefined) attrs(halo, { d });
  if (body !== undefined) attrs(body, { d });
}

function crosshairPath(): string {
  const near = String(CROSS_GAP_PX);
  const far = String(CROSS_GAP_PX + CROSS_ARM_PX);
  return `M-${far} 0 H-${near} M${near} 0 H${far} M0 -${far} V-${near} M0 ${near} V${far}`;
}

function loupeGroup(): SVGGElement {
  const group = svgNode('g');
  group.setAttribute('class', 'map3d-loupe-lens');
  const rim = svgNode('circle');
  rim.setAttribute('class', 'map3d-loupe-rim');
  const halo = svgNode('path');
  halo.setAttribute('class', 'map3d-loupe-halo');
  const cross = svgNode('path');
  cross.setAttribute('class', 'map3d-loupe-cross');
  const d = crosshairPath();
  halo.setAttribute('d', d);
  cross.setAttribute('d', d);
  group.append(rim, halo, cross);
  return group;
}

function drawLoupe(group: Element, placement: LoupePlacement): void {
  const half = placement.size / 2;
  attrs(group, {
    transform: `translate(${round(placement.left + half)} ${round(placement.top + half)})`,
  });
  const [rim] = Array.from(group.children);
  if (rim !== undefined) attrs(rim, { r: round(half - LOUPE_RIM_PX / 2) });
}

function loupeScope(scope: HTMLElement, placement: LoupePlacement | null): void {
  attrs(scope, { 'data-loupe': placement === null ? 'off' : 'on' });
  if (placement === null) return;
  const half = placement.size / 2;
  scope.style.setProperty('--loupe-x', `${round(placement.left + half)}px`);
  scope.style.setProperty('--loupe-y', `${round(placement.top + half)}px`);
  scope.style.setProperty('--loupe-r', `${round(half)}px`);
}

function drawTouch(node: Element, disc: Disc): void {
  attrs(node, {
    class: 'map3d-edit-touch',
    cx: round(disc.x),
    cy: round(disc.y),
    r: round(disc.r),
  });
}

function drawPill(node: HTMLElement, pill: DrawnPill): void {
  attrs(node, {
    class: 'map3d-edit-pill',
    'data-look': pill.look,
    'data-tone': pill.tone,
    style: `left:${round(pill.x)}px;top:${round(pill.y)}px`,
  });
  if (node.textContent !== pill.text) node.replaceChildren(pill.text);
}

export class OverlayPainter {
  private readonly svg = svgNode('svg');
  private readonly pills = document.createElement('div');
  private readonly paths: Keyed<SVGGElement>;
  private readonly handles: Keyed<SVGGElement>;
  private readonly pulse: Keyed<SVGGElement>;
  private readonly touches: Keyed<SVGCircleElement>;
  private readonly labels: Keyed<HTMLDivElement>;
  private readonly lensSvg = svgNode('svg');
  private readonly lens: Keyed<SVGGElement>;

  constructor(
    private readonly root: HTMLElement,
    private readonly scope: HTMLElement,
  ) {
    this.svg.setAttribute('class', 'map3d-edit-svg');
    this.pills.className = 'map3d-edit-pills';
    const [pathLayer, touchLayer, pulseLayer, handleLayer] = [
      svgNode('g'),
      svgNode('g'),
      svgNode('g'),
      svgNode('g'),
    ];
    this.svg.append(pathLayer, touchLayer, pulseLayer, handleLayer);
    this.lensSvg.setAttribute('class', 'map3d-loupe');
    this.lensSvg.setAttribute('aria-hidden', 'true');
    root.append(this.svg, this.pills, this.lensSvg);
    this.lens = new Keyed(this.lensSvg, loupeGroup);
    this.paths = new Keyed(pathLayer, pathGroup);
    this.handles = new Keyed(handleLayer, handleGroup);
    this.pulse = new Keyed(pulseLayer, () => svgNode('g'));
    this.touches = new Keyed(touchLayer, () => svgNode('circle'));
    this.labels = new Keyed(this.pills, () => document.createElement('div'));
  }

  paint(scene: OverlayScene | null): void {
    const shown = scene ?? EMPTY_SCENE;
    const { paths, handles, pills, touches } = shown;
    this.paths.sync(
      paths.map((path) => path.key),
      (node, index) => {
        const path = paths[index];
        if (path !== undefined) drawPath(node, path);
      },
    );
    this.handles.sync(
      handles.map((handle) => handle.id),
      (node, index) => {
        const handle = handles[index];
        if (handle !== undefined) drawHandle(node, handle);
      },
    );
    this.labels.sync(
      pills.map((pill) => pill.key),
      (node, index) => {
        const pill = pills[index];
        if (pill !== undefined) drawPill(node, pill);
      },
    );
    this.paintPulse(shown.pulse);
    this.touches.sync(
      touches.map((_, index) => `touch:${String(index)}`),
      (node, index) => {
        const disc = touches[index];
        if (disc !== undefined) drawTouch(node, disc);
      },
    );
    attrs(this.root, { 'data-cursor': shown.cursor ?? 'none' });
  }

  loupe(placement: LoupePlacement | null): void {
    this.lens.sync(placement === null ? [] : ['lens'], (group) => {
      if (placement !== null) drawLoupe(group, placement);
    });
    loupeScope(this.scope, placement);
  }

  dispose(): void {
    loupeScope(this.scope, null);
    this.svg.remove();
    this.pills.remove();
    this.lensSvg.remove();
  }

  private paintPulse(pulse: OverlayScene['pulse']): void {
    this.pulse.sync(pulse === null ? [] : ['pulse'], (group) => {
      if (pulse === null) return;
      if (group.childElementCount === 0) {
        group.append(
          ...PULSE_RINGS_PX.map((size, index) => {
            const ring = svgNode('circle');
            attrs(ring, {
              class: 'map3d-edit-pulse',
              r: round(size / 2),
              style: `animation-delay:${String(index * 120)}ms`,
            });
            return ring;
          }),
        );
      }
      attrs(group, { transform: `translate(${round(pulse.x)} ${round(pulse.y)})` });
    });
  }
}

export function EditOverlayLayer({
  onPainter,
}: {
  readonly onPainter: (painter: OverlayPainter | null) => void;
}): ReactNode {
  const attach = useCallback(
    (root: HTMLDivElement): (() => void) => {
      const painter = new OverlayPainter(root, root.parentElement ?? root);
      onPainter(painter);
      return () => {
        onPainter(null);
        painter.dispose();
      };
    },
    [onPainter],
  );
  return <div ref={attach} className="map3d-edit" />;
}
