import type { Camera, Scene } from 'three';
import type { CompiledProgram } from '../../../components/house-map/3d/render-core-cost';
import type { LiveGl } from './renderer-core';

export interface FakeCall {
  readonly scene: Scene;
  readonly camera: Camera;
  readonly viewport: readonly number[];
}

export interface FakeGl {
  readonly gl: LiveGl;
  readonly calls: FakeCall[];
  readonly clears: () => number;
  readonly programs: CompiledProgram[];
  readonly pixelRatio: () => number;
  readonly size: () => readonly number[];
  readonly scissor: () => readonly number[];
}

export function fakeGl(): FakeGl {
  const calls: FakeCall[] = [];
  let viewport: readonly number[] = [];
  let pixelRatio = 0;
  let scissor: readonly number[] = [];
  let size: readonly number[] = [];
  let clears = 0;
  const programs: CompiledProgram[] = [];
  const gl: LiveGl = {
    autoClear: true,
    info: { programs },
    setPixelRatio: (value) => {
      pixelRatio = value;
    },
    setSize: (width, height) => {
      size = [width, height];
    },
    setScissorTest: () => undefined,
    setScissor: (x, y, width, height) => {
      scissor = [Number(x), Number(y), Number(width), Number(height)];
    },
    setViewport: (x, y, width, height) => {
      viewport = [Number(x), Number(y), Number(width), Number(height)];
    },
    clear: () => {
      clears += 1;
    },
    render: (scene, camera) => {
      calls.push({ scene, camera, viewport });
    },
  };
  return {
    gl,
    calls,
    programs,
    clears: (): number => clears,
    pixelRatio: (): number => pixelRatio,
    size: (): readonly number[] => size,
    scissor: (): readonly number[] => scissor,
  };
}
