import type { GraphScene, GraphSceneNode } from '../../model/graph/scene-contract';

export const OPENING_ZOOM: Readonly<Record<'touch' | 'pointer', number>> = {
  touch: 1,
  pointer: 0.85,
};

export const SMALLEST_OPENING_ZOOM = Math.min(OPENING_ZOOM.touch, OPENING_ZOOM.pointer);

export const OPENING_MARGIN = 24;

export const EMPTY_SIDE = 280;

export const ZOOM_LIMITS = { min: 0.1, max: 2 } as const;

export const PORT_TARGET_MIN_ZOOM = 0.9;

export const FOCUS_MAX_ZOOM = 1;

export const FOCUS_MIN_ZOOM = 0.85;

export const FIT_MAX_ZOOM = 1;

export interface Padding {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

export const FIT_PADDING: Padding = { top: 24, left: 24, bottom: 120, right: 120 };

export const WHOLE_PADDING: Padding = { top: 16, left: 16, bottom: 16, right: 16 };

export type GraphFraming = 'opening' | 'whole';

export const VISIBLE_ONLY_ABOVE = 150;

const FRAME_CARDS = 4;

export const FIT_OPTIONS = {
  includeHiddenNodes: true,
  maxZoom: FIT_MAX_ZOOM,
  minZoom: ZOOM_LIMITS.min,
  padding: {
    top: '24px',
    left: '24px',
    bottom: '120px',
    right: '120px',
  },
} as const;

export const VIEWPORT_COMMANDS = ['fit', 'fitSelection', 'zoomIn', 'zoomOut'] as const;

export interface ViewportCommand {
  readonly type: (typeof VIEWPORT_COMMANDS)[number];
  readonly seq: number;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface Frame {
  readonly width: number;
  readonly height: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function along(size: number, room: number, zoom: number, origin: number): number {
  return (room - size * zoom) / 2 - origin * zoom;
}

export function fitViewport(
  graph: Box,
  start: Box | null,
  frame: Frame,
  padding: Padding,
): Viewport {
  const roomX = frame.width - padding.left - padding.right;
  const roomY = frame.height - padding.top - padding.bottom;
  const byWidth = Math.min(roomX / graph.width, FIT_MAX_ZOOM);
  const whole = Math.min(byWidth, roomY / graph.height);
  const anchor = start ?? graph;
  if (whole >= ZOOM_LIMITS.min || whole === byWidth) {
    return {
      x: padding.left + along(graph.width, roomX, whole, graph.x),
      y: padding.top + along(graph.height, roomY, whole, graph.y),
      zoom: whole,
    };
  }
  return {
    x: padding.left + along(graph.width, roomX, byWidth, graph.x),
    y: padding.top + along(anchor.height, roomY, byWidth, anchor.y),
    zoom: byWidth,
  };
}

export function sceneBounds(nodes: readonly GraphSceneNode[]): Box | null {
  if (nodes.length === 0) return null;
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  return {
    x: left,
    y: top,
    width: Math.max(...nodes.map((node) => node.x + node.w)) - left,
    height: Math.max(...nodes.map((node) => node.y + node.h)) - top,
  };
}

const DECISIVE: ReadonlySet<GraphSceneNode['family']> = new Set(['decision', 'fork']);

function framed(scene: GraphScene): readonly GraphSceneNode[] {
  const cards = scene.nodes.filter((node) => node.family !== 'value');
  const stop = cards.findIndex((node) => DECISIVE.has(node.family));
  const end = stop < 0 ? FRAME_CARDS : Math.min(stop + 1, FRAME_CARDS);
  return cards.slice(0, Math.max(end, 1));
}

export function isEmptyScene(scene: GraphScene): boolean {
  const [only] = scene.nodes;
  return scene.nodes.length === 1 && only?.family === 'start';
}

function centred(node: GraphSceneNode, frame: Frame, zoom: number): Viewport {
  const left = node.x - EMPTY_SIDE;
  const width = (EMPTY_SIDE * 2 + node.w) * zoom;
  return {
    x: (frame.width - width) / 2 - left * zoom,
    y: frame.height / 3 - node.y * zoom,
    zoom,
  };
}

export function openingViewport(
  scene: GraphScene,
  frame: Frame,
  idiom: 'touch' | 'pointer',
): Viewport {
  const zoom = OPENING_ZOOM[idiom];
  const [only] = scene.nodes;
  if (only !== undefined && isEmptyScene(scene)) return centred(only, frame, zoom);
  const nodes = framed(scene);
  if (nodes.length === 0) return { x: OPENING_MARGIN, y: OPENING_MARGIN, zoom };
  const room = (frame.width - OPENING_MARGIN * 2) / zoom;
  const left = Math.min(...nodes.map((node) => node.x));
  const seen = scene.nodes.filter((node) => node.x + node.w > left && node.x < left + room);
  const top = Math.min(...seen.map((node) => node.y));
  return { x: OPENING_MARGIN - left * zoom, y: OPENING_MARGIN - top * zoom, zoom };
}

export function framedViewport(
  scene: GraphScene,
  frame: Frame,
  idiom: 'touch' | 'pointer',
  framing: GraphFraming,
): Viewport {
  const graph = framing === 'whole' ? sceneBounds(scene.nodes) : null;
  if (graph === null) return openingViewport(scene, frame, idiom);
  return wholeViewport(graph, frame);
}

function wholeRoom(frame: Frame): Frame {
  return {
    width: frame.width - WHOLE_PADDING.left - WHOLE_PADDING.right,
    height: frame.height - WHOLE_PADDING.top - WHOLE_PADDING.bottom,
  };
}

export function wholeZoom(graph: Box, frame: Frame): number {
  const room = wholeRoom(frame);
  return Math.min(room.width / graph.width, room.height / graph.height, FIT_MAX_ZOOM);
}

export function wholeViewport(graph: Box, frame: Frame): Viewport {
  const zoom = wholeZoom(graph, frame);
  const room = wholeRoom(frame);
  return {
    x: WHOLE_PADDING.left + along(graph.width, room.width, zoom, graph.x),
    y: WHOLE_PADDING.top + along(graph.height, room.height, zoom, graph.y),
    zoom,
  };
}

export function wholeHeight(graph: Box, width: number, available: number): number {
  const byWidth = wholeZoom(graph, { width, height: Number.POSITIVE_INFINITY });
  const fitted = graph.height * byWidth + WHOLE_PADDING.top + WHOLE_PADDING.bottom;
  return Math.min(Math.ceil(fitted), available);
}

export function portsAreTargets(zoom: number, idiom: 'touch' | 'pointer'): boolean {
  return idiom === 'pointer' || zoom >= PORT_TARGET_MIN_ZOOM;
}

export function commandKey(command: ViewportCommand | null): string {
  return command === null ? '' : `${command.type}:${String(command.seq)}`;
}
