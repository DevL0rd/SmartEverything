import { describe, expect, it } from 'vitest';
import type { MeshLayer, Rgb } from './mesh';
import {
  DOCK_TOWER_HEIGHT_METRES,
  ROBOT_HEIGHT_METRES,
  ROBOT_RADIUS_METRES,
  buildDockLayer,
  buildRobotLayers,
  dockColoursOf,
  rgb,
  robotColoursOf,
} from './vacuum-models';

const ROBOT = {
  body: [0.95, 0.95, 0.94],
  marker: [0.94, 0.56, 0.19],
  turret: [0.13, 0.13, 0.12],
} satisfies Record<string, Rgb>;

const DOCK = { tower: [0.9, 0.9, 0.88], ramp: [0.2, 0.2, 0.2] } satisfies Record<string, Rgb>;

function vertices(layer: MeshLayer): readonly { position: Rgb; colour: Rgb }[] {
  return Array.from({ length: layer.positions.length / 3 }, (_, index) => ({
    position: [
      layer.positions[index * 3] ?? 0,
      layer.positions[index * 3 + 1] ?? 0,
      layer.positions[index * 3 + 2] ?? 0,
    ],
    colour: [
      layer.colours[index * 3] ?? 0,
      layer.colours[index * 3 + 1] ?? 0,
      layer.colours[index * 3 + 2] ?? 0,
    ],
  }));
}

function body(): MeshLayer {
  const layer = buildRobotLayers(ROBOT).find((entry) => entry.id === 'robot-body');
  if (layer === undefined) throw new Error('no robot body');
  return layer;
}

describe('the 3D robot', () => {
  it('stays a 35 cm round body with a bevelled top inside its height', () => {
    const points = vertices(body()).map((vertex) => vertex.position);
    const radius = Math.max(...points.map(([x, , z]) => Math.hypot(x, z)));
    expect(radius).toBeCloseTo(ROBOT_RADIUS_METRES, 4);
    const top = points.filter(([, y]) => y >= ROBOT_HEIGHT_METRES - 1e-6);
    expect(Math.max(...top.map(([x, , z]) => Math.hypot(x, z)))).toBeLessThan(ROBOT_RADIUS_METRES);
  });

  it('paints the dark bumper window only on the front half', () => {
    const dark = vertices(body()).filter(
      (vertex) => vertex.colour[0] < 0.12 && vertex.position[1] < ROBOT_HEIGHT_METRES - 0.01,
    );
    expect(dark.length).toBeGreaterThan(0);
    expect(dark.every((vertex) => vertex.position[0] > 0)).toBe(true);
  });

  it('rings the turret well with the marker colour', () => {
    const marked = vertices(body()).filter(
      (vertex) => Math.abs(vertex.colour[0] - ROBOT.marker[0]) < 1e-6,
    );
    expect(marked.length).toBeGreaterThan(0);
  });

  it('keeps the robot and dock cheap: two robot layers, one dock layer, few triangles', () => {
    const robot = buildRobotLayers(ROBOT);
    const dock = buildDockLayer({ x: 1, y: 2, yaw: 0.4 }, DOCK);
    expect(robot.map((layer) => layer.id)).toEqual(['robot-body', 'robot-turret']);
    const triangles = robot.reduce((sum, layer) => sum + layer.triangles, dock?.triangles ?? 0);
    expect(triangles).toBeLessThan(2500);
  });
});

describe('the 3D dock', () => {
  it('stands as tall as the Omni station and shows its two tanks on the front', () => {
    const dock = buildDockLayer({ x: 0, y: 0, yaw: 0 }, DOCK);
    if (dock === null) throw new Error('no dock');
    const points = vertices(dock);
    expect(Math.max(...points.map((vertex) => vertex.position[1]))).toBeGreaterThanOrEqual(
      DOCK_TOWER_HEIGHT_METRES,
    );
    const tanks = points.filter((vertex) => vertex.colour[2] > 0.85 && vertex.colour[0] < 0.4);
    expect(tanks.length).toBeGreaterThan(0);
    expect(tanks.every((vertex) => vertex.position[0] > -0.06)).toBe(true);
  });
});

describe('the 3D finishes', () => {
  const luminance = ([r, g, b]: Rgb): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  it('paints a graphite body between the white and black finishes in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const graphite = luminance(robotColoursOf('graphite', theme).body);
      expect(graphite).toBeLessThan(luminance(robotColoursOf('white', theme).body));
      expect(graphite).toBeGreaterThan(luminance(robotColoursOf('black', theme).body));
    }
  });

  it('gives the graphite station a lighter tower than the graphite robot', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(luminance(dockColoursOf('graphite', theme).tower)).toBeGreaterThan(
        luminance(robotColoursOf('graphite', theme).body),
      );
    }
  });

  it('keeps the same accent marker whatever the finish', () => {
    expect(robotColoursOf('black', 'dark').marker).toStrictEqual(
      robotColoursOf('white', 'dark').marker,
    );
  });

  it('reads hex colours as channel shares', () => {
    expect(rgb(0xff8000)).toStrictEqual([1, 128 / 255, 0]);
  });
});
