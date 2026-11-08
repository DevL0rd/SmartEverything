import type { ModelSpecGeometry } from '@smarteverything/domain';

type Extrude = Extract<ModelSpecGeometry, { type: 'extrude' }>;

export type PathCommand = Extrude['path'][number];

export interface PathBuilder {
  readonly line: (x: number, y: number) => PathBuilder;
  readonly quadratic: (cx: number, cy: number, x: number, y: number) => PathBuilder;
  readonly cubic: (control1: Point, control2: Point, x: number, y: number) => PathBuilder;
  readonly arc: (radii: ArcRadii, x: number, y: number) => PathBuilder;
  readonly close: () => PathBuilder;
  readonly build: () => readonly PathCommand[];
}

export type Point = readonly [number, number];

export interface ArcRadii {
  readonly rx: number;
  readonly ry: number;
  readonly rotation?: number;
  readonly large?: boolean;
  readonly sweep?: boolean;
}

interface Origin {
  readonly x: number;
  readonly y: number;
}

function builderOf(commands: readonly PathCommand[], origin: Origin): PathBuilder {
  const next = (command: PathCommand): PathBuilder => builderOf([...commands, command], origin);
  return {
    line: (x, y) => next({ op: 'line', x, y }),
    quadratic: (cx, cy, x, y) => next({ op: 'quadratic', cx, cy, x, y }),
    cubic: (control1, control2, x, y) =>
      next({
        op: 'cubic',
        c1x: control1[0],
        c1y: control1[1],
        c2x: control2[0],
        c2y: control2[1],
        x,
        y,
      }),
    arc: (radii, x, y) =>
      next({
        op: 'arc',
        rx: radii.rx,
        ry: radii.ry,
        ...(radii.rotation === undefined ? {} : { rotation: radii.rotation }),
        large: radii.large ?? false,
        sweep: radii.sweep ?? true,
        x,
        y,
      }),
    close: () => next({ op: 'line', x: origin.x, y: origin.y }),
    build: () => commands,
  };
}

export function pathBuilder(x: number, y: number): PathBuilder {
  return builderOf([{ op: 'move', x, y }], { x, y });
}

export function roundedRectPath(
  width: number,
  height: number,
  radius: number,
): readonly PathCommand[] {
  const x = width / 2;
  const y = height / 2;
  const r = Math.min(radius, x, y);
  if (r <= 0) {
    return pathBuilder(-x, -y).line(x, -y).line(x, y).line(-x, y).close().build();
  }
  const corner = { rx: r, ry: r };
  return pathBuilder(-x + r, -y)
    .line(x - r, -y)
    .arc(corner, x, -y + r)
    .line(x, y - r)
    .arc(corner, x - r, y)
    .line(-x + r, y)
    .arc(corner, -x, y - r)
    .line(-x, -y + r)
    .arc(corner, -x + r, -y)
    .build();
}

export function extrudePath(
  path: readonly PathCommand[] | PathBuilder,
  depth: number,
  bevel?: number,
): Extrude {
  const commands = 'build' in path ? path.build() : path;
  return {
    type: 'extrude',
    path: [...commands],
    depth,
    ...(bevel === undefined ? {} : { bevel }),
  };
}
