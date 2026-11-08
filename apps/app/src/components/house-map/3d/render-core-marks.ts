import { Vector3, type Camera } from 'three';
import type { StatusTone } from '../../tone';
import type { LiveClimateChip } from './overlay-kit';
import type { Viewport } from './render-core-orbit';
import type { SceneLabel } from './vacuum-geometry';

export interface ScreenMark {
  readonly roomId: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

export interface ScreenChip {
  readonly roomId: string;
  readonly text: string;
  readonly tone: StatusTone;
  readonly x: number;
  readonly y: number;
}

export interface ScreenMarks {
  readonly width: number;
  readonly height: number;
  readonly labels: readonly ScreenMark[];
  readonly chips: readonly ScreenChip[];
  readonly robot: { readonly x: number; readonly y: number } | null;
}

export interface MarkSources {
  readonly labels: readonly SceneLabel[];
  readonly chips: readonly LiveClimateChip[];
  readonly robot: { readonly x: number; readonly z: number } | null;
}

export function screenMarks(camera: Camera, viewport: Viewport, sources: MarkSources): ScreenMarks {
  const toScreen = (position: readonly [number, number, number]): { x: number; y: number } => {
    const point = new Vector3(...position).project(camera);
    return {
      x: ((point.x + 1) / 2) * viewport.width,
      y: ((1 - point.y) / 2) * viewport.height,
    };
  };
  return {
    width: viewport.width,
    height: viewport.height,
    labels: sources.labels.map((label) => ({
      roomId: label.roomId,
      name: label.name,
      ...toScreen(label.position),
    })),
    chips: sources.chips.map(({ roomId, at, text, tone }) => ({
      ...{ roomId, text, tone },
      ...toScreen([at.x, 0, -at.y]),
    })),
    robot: sources.robot === null ? null : toScreen([sources.robot.x, 0, sources.robot.z]),
  };
}
