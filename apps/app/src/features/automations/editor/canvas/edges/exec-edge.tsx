import { memo, type CSSProperties, type ReactNode } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  type Position,
} from '@xyflow/react';
import type { EdgeEnd } from '../../../model/graph/scene-contract';
import type { GraphFlowEdge } from '../graph-canvas-types';
import { useGraphEmit } from '../graph-context';
import {
  cleaned,
  plainLegs,
  routeAround,
  type RoutePoint,
  type WireBox,
  type WirePoints,
  type WireRoute,
} from './exec-route';

export const STRAIGHT_BELOW = 3;
const CORNER = 12;

export interface WireGeometry {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly sourcePosition: Position;
  readonly targetPosition: Position;
}

export interface WirePath {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
}

function toward(from: RoutePoint, to: RoutePoint, by: number): RoutePoint {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const share = length === 0 ? 0 : by / length;
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
}

function at(point: RoutePoint): string {
  return `${String(point.x)},${String(point.y)}`;
}

function roundedPath(points: readonly RoutePoint[]): string {
  const parts: string[] = [];
  points.forEach((point, index) => {
    const before = points[index - 1];
    const after = points[index + 1];
    if (before === undefined) parts.push(`M ${at(point)}`);
    else if (after === undefined) parts.push(`L ${at(point)}`);
    else {
      const half =
        Math.min(
          Math.hypot(point.x - before.x, point.y - before.y),
          Math.hypot(after.x - point.x, after.y - point.y),
        ) / 2;
      const radius = Math.min(CORNER, half);
      parts.push(
        `L ${at(toward(point, before, radius))} Q ${at(point)} ${at(toward(point, after, radius))}`,
      );
    }
  });
  return parts.join(' ');
}

function routedPath(route: WireRoute): WirePath {
  return { path: roundedPath(cleaned(route.points)), labelX: route.label.x, labelY: route.label.y };
}

function middleOf(points: WirePoints): RoutePoint {
  const at = Math.floor((points.length - 2) / 2);
  const from = points[at] ?? { x: 0, y: 0 };
  const to = points[at + 1] ?? from;
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

function legsPath(points: WirePoints): WirePath {
  const label = middleOf(points);
  return { path: roundedPath(points), labelX: label.x, labelY: label.y };
}

function stretch(route: WirePoints, sourceX: number, targetX: number): (x: number) => number {
  const from = route[0]?.x ?? sourceX;
  const to = route[route.length - 1]?.x ?? targetX;
  const scale = to === from ? 1 : (targetX - sourceX) / (to - from);
  return (x) => sourceX + (x - from) * scale;
}

export function followRoute(route: WirePoints, ends: WireGeometry): WirePoints | undefined {
  const { sourceX, sourceY, targetX, targetY } = ends;
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  if (route.length < 3)
    return Math.abs(targetY - sourceY) < STRAIGHT_BELOW ? [source, target] : undefined;
  if (targetX <= sourceX) return undefined;
  const toLive = stretch(route, sourceX, targetX);
  const inner = route.slice(1, -1);
  const last = inner.length - 1;
  const fitted = inner.map((point, index) => ({
    x: toLive(point.x),
    y: index === 0 ? sourceY : index === last ? targetY : point.y,
  }));
  return [source, ...fitted, target];
}

export function execPath(
  geometry: WireGeometry,
  around: readonly WireBox[] = [],
  wires: readonly WirePoints[] = [],
): WirePath {
  const { sourceX, sourceY, targetX, targetY } = geometry;
  const route = routeAround(geometry, around, wires);
  if (route !== undefined) return routedPath(route);
  if (Math.abs(targetY - sourceY) < STRAIGHT_BELOW && targetX > sourceX) {
    return {
      path: `M ${String(sourceX)},${String(sourceY)} L ${String(targetX)},${String(targetY)}`,
      labelX: (sourceX + targetX) / 2,
      labelY: (sourceY + targetY) / 2,
    };
  }
  if (targetX > sourceX) return legsPath(cleaned(plainLegs(geometry)));
  const [path, labelX, labelY] = getSmoothStepPath({ ...geometry, borderRadius: CORNER });
  return { path, labelX, labelY };
}

export function wirePath(
  geometry: WireGeometry,
  route: WirePoints | null,
  around: readonly WireBox[] = [],
  wires: readonly WirePoints[] = [],
): WirePath {
  const followed = route === null ? undefined : followRoute(route, geometry);
  if (followed === undefined) return execPath(geometry, around, wires);
  if (followed.length === 2) return execPath(geometry);
  return legsPath(followed);
}

function InsertOnWire({
  x,
  y,
  from,
}: {
  readonly x: number;
  readonly y: number;
  readonly from: EdgeEnd;
}): ReactNode {
  const emit = useGraphEmit();
  const style: CSSProperties = {
    transform: `translate(-50%, -50%) translate(${String(x)}px, ${String(y)}px)`,
  };
  return (
    <EdgeLabelRenderer>
      <button
        type="button"
        className="gc-insert nodrag nopan"
        style={style}
        tabIndex={-1}
        aria-label="Add a step on this wire"
        onClick={(): void => {
          emit({ type: 'insertOnWire', from });
        }}
      >
        +
      </button>
    </EdgeLabelRenderer>
  );
}

function ExecEdgeView(props: EdgeProps<GraphFlowEdge>): ReactNode {
  const { id, data, interactionWidth } = props;
  if (data === undefined) return null;
  const { path, labelX, labelY } = wirePath(
    { ...props, targetY: props.targetY + data.shift },
    data.points,
    data.around,
    data.wires,
  );
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        {...(interactionWidth === undefined ? {} : { interactionWidth })}
        data-kind="exec"
      />
      {data.scene.fixed ? null : <InsertOnWire x={labelX} y={labelY} from={data.scene.source} />}
    </>
  );
}

export const ExecEdge = memo(ExecEdgeView);
