import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { scrubbedScene, vacuumInput } from './scene-input-fixture';
import { buildSceneGeometry } from './vacuum-geometry';
import { fitToCorners } from './render-core-fit';
import { NO_INSETS, buildCamera, frameRoom, presetOrbit } from './render-core-orbit';
import { releaseRenderer } from './render-core-renderer';

const geometry = buildSceneGeometry(vacuumInput(scrubbedScene));

const floor = geometry.base.find((layer) => layer.id === 'floor') ?? null;

const targets = { floor, ranges: geometry.rooms };

const view = { width: 640, height: 360, insets: NO_INSETS };

function roomVertices(roomId: string): readonly Vector3[] {
  if (floor === null) throw new Error('The fixture has no floor layer');
  return geometry.rooms
    .filter((range) => range.roomId === roomId)
    .flatMap((range) =>
      Array.from({ length: range.triangleCount * 3 }, (_, offset) => {
        const vertex = Number(floor.indices[range.firstTriangle * 3 + offset]);
        return new Vector3(
          Number(floor.positions[vertex * 3]),
          Number(floor.positions[vertex * 3 + 1]),
          Number(floor.positions[vertex * 3 + 2]),
        );
      }),
    );
}

function firstRoom(): string {
  const room = geometry.rooms[0]?.roomId;
  if (room === undefined) throw new Error('The fixture has no rooms');
  return room;
}

describe('frameRoom', () => {
  it('frames the chosen room inside the whole scene frame', () => {
    const roomId = firstRoom();
    const framed = frameRoom(targets, [roomId], geometry);
    expect(framed.frame.radius).toBeGreaterThan(0);
    expect(framed.frame.radius).toBeLessThan(geometry.frame.radius);
    const xs = framed.extent.map(([x]) => x);
    const zs = framed.extent.map(([, , z]) => z);
    for (const vertex of roomVertices(roomId)) {
      expect(vertex.x).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(vertex.x).toBeLessThanOrEqual(Math.max(...xs));
      expect(vertex.z).toBeGreaterThanOrEqual(Math.min(...zs));
      expect(vertex.z).toBeLessThanOrEqual(Math.max(...zs));
    }
  });

  it('keeps the wall height of the whole scene in the room extent', () => {
    const framed = frameRoom(targets, [firstRoom()], geometry);
    const top = Math.max(...geometry.extent.map(([, y]) => y));
    expect(framed.extent).toHaveLength(8);
    expect(new Set(framed.extent.map(([, y]) => y))).toEqual(new Set([0, top]));
  });

  it('keeps the whole scene for no rooms, unknown rooms and a missing floor', () => {
    expect(frameRoom(targets, [], geometry)).toBe(geometry);
    expect(frameRoom(targets, ['no-such-room'], geometry)).toBe(geometry);
    expect(frameRoom({ floor: null, ranges: geometry.rooms }, [firstRoom()], geometry)).toBe(
      geometry,
    );
  });

  it('brings a Top camera closer than the whole floor and keeps the room in view', () => {
    const roomId = firstRoom();
    const framed = frameRoom(targets, [roomId], geometry);
    const aspect = view.width / view.height;
    const room = fitToCorners(
      presetOrbit('top', framed.frame, aspect),
      framed.extent,
      view,
      framed.frame,
    );
    const whole = fitToCorners(
      presetOrbit('top', geometry.frame, aspect),
      geometry.extent,
      view,
      geometry.frame,
    );
    expect(room.distance).toBeLessThan(whole.distance);
    const camera = buildCamera(room, view, framed.frame);
    for (const vertex of roomVertices(roomId)) {
      const point = vertex.clone().project(camera);
      expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(point.y)).toBeLessThanOrEqual(1);
    }
  });
});

describe('releaseRenderer', () => {
  it('frees the WebGL context when a stage unmounts', () => {
    const renderer = { dispose: vi.fn(), forceContextLoss: vi.fn() };
    releaseRenderer(renderer);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
  });
});
