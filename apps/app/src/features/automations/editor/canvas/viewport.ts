import { COMPACT } from '../../model/canvas/metrics';
import type { Scene, SceneNode, Viewport, ViewportCommand } from '../../model/canvas/contract';

export const COMPACT_BELOW_WIDTH = 560;

export const OPENING_ZOOM = { wide: 0.85, compact: 1 } as const;

export const ZOOM_LIMITS = {
  wide: { min: 0.1, max: 2 },
  compact: { min: 0.5, max: 1.6 },
} as const;

export const PORT_TARGET_MIN_ZOOM = 0.9;

export const OPENING_MARGIN = 24;

export const FOCUS_MAX_ZOOM = 1;

export const VISIBLE_ONLY_ABOVE = 200;

export const KEY_PAN_STEP = 80;

export const FIT_OPTIONS = { includeHiddenNodes: true, padding: 0.08 } as const;

export type SizeClass = 'compact' | 'wide';

export function sizeClassFor(width: number): SizeClass {
  return width < COMPACT_BELOW_WIDTH ? 'compact' : 'wide';
}

const BODY_ROLES: ReadonlySet<SceneNode['role']> = new Set([
  'trigger',
  'triggerGroup',
  'admit',
  'step',
  'container',
  'inputs',
]);

function anchorOf(scene: Scene): { readonly x: number; readonly y: number } {
  const body = scene.nodes.filter((node) => BODY_ROLES.has(node.role));
  const nodes = body.length === 0 ? scene.nodes : body;
  if (nodes.length === 0) return { x: 0, y: 0 };
  return {
    x: Math.min(...nodes.map((node) => node.x)),
    y: Math.min(...scene.nodes.map((node) => node.y)),
  };
}

export function openingViewport(scene: Scene): Viewport {
  const zoom = OPENING_ZOOM[scene.mode];
  const anchor = anchorOf(scene);
  if (scene.mode === 'compact')
    return { x: COMPACT.gutter, y: COMPACT.gutter - anchor.y * zoom, zoom };
  return {
    x: OPENING_MARGIN - anchor.x * zoom,
    y: OPENING_MARGIN - anchor.y * zoom,
    zoom,
  };
}

export function zoomLimits(mode: Scene['mode']): { readonly min: number; readonly max: number } {
  return ZOOM_LIMITS[mode];
}

export function portsAreTargets(zoom: number, idiom: 'touch' | 'pointer'): boolean {
  return idiom === 'pointer' || zoom >= PORT_TARGET_MIN_ZOOM;
}

export function commandKey(command: ViewportCommand | null): string {
  return command === null ? '' : `${command.type}:${String(command.seq)}`;
}
