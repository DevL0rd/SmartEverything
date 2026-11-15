import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  type EventDispatcher,
  FloatType,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  ShapeUtils,
  Vector2,
  WebGLRenderer,
  type WebGLRendererParameters,
} from 'three';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

type RendererCanvas = NonNullable<WebGLRendererParameters['canvas']>;

interface FakeSurface {
  readonly canvas: RendererCanvas;
  readonly deletedTextures: () => number;
}

const GL_VERSION = 7938;
const GL_SHADING_LANGUAGE_VERSION = 35724;

function isRendererCanvas(value: unknown): value is RendererCanvas {
  return typeof value === 'object' && value !== null && 'getContext' in value;
}

function fakeContext(canvas: object, onDeleteTexture: () => void): object {
  const known: Record<string | symbol, unknown> = {
    canvas,
    drawingBufferWidth: 1,
    drawingBufferHeight: 1,
    VERSION: GL_VERSION,
    SHADING_LANGUAGE_VERSION: GL_SHADING_LANGUAGE_VERSION,
    getParameter: (name: number) =>
      name === GL_VERSION || name === GL_SHADING_LANGUAGE_VERSION ? 'WebGL 2.0' : 16,
    getExtension: () => null,
    getSupportedExtensions: () => [],
    getContextAttributes: () => ({ alpha: true, depth: true, stencil: false, antialias: false }),
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    isContextLost: () => false,
    getError: () => 0,
    getProgramInfoLog: () => '',
    getShaderInfoLog: () => '',
    getShaderSource: () => '',
    deleteTexture: onDeleteTexture,
  };
  return new Proxy(known, {
    get: (target, key): unknown => {
      if (key in target) return target[key];
      if (typeof key === 'string' && /^[A-Z0-9_]+$/u.test(key)) return 0;
      return () => ({});
    },
  });
}

function fakeSurface(): FakeSurface {
  let deleted = 0;
  const canvas: Record<string, unknown> = {
    width: 1,
    height: 1,
    style: {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const context = fakeContext(canvas, () => {
    deleted += 1;
  });
  canvas['getContext'] = (): object => context;
  if (!isRendererCanvas(canvas)) throw new Error('The fake canvas has no getContext');
  return { canvas, deletedTextures: () => deleted };
}

function sharedTexture(): DataTexture {
  const texture = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
  texture.needsUpdate = true;
  return texture;
}

function disposeListeners(target: EventDispatcher<{ dispose: object }>): Set<unknown> {
  const listeners = new Set<unknown>();
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  vi.spyOn(target, 'addEventListener').mockImplementation((type, listener) => {
    listeners.add(listener);
    add(type, listener);
  });
  vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener) => {
    listeners.delete(listener);
    remove(type, listener);
  });
  return listeners;
}

describe('three contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'three')).toBe(installedVersion('three'));
  });

  it('has type definitions of the same minor release', () => {
    const [major, minor] = installedVersion('three').split('.');
    expect(declaredVersion(APP_MANIFEST, '@types/three')).toMatch(
      new RegExp(`^${String(major)}\\.${String(minor)}\\.\\d+$`),
    );
    expect(installedVersion('@types/three')).toBe(declaredVersion(APP_MANIFEST, '@types/three'));
  });

  it('triangulates a concave outline into corners minus two triangles', () => {
    const outline = [
      new Vector2(0, 0),
      new Vector2(4, 0),
      new Vector2(4, 4),
      new Vector2(2, 1),
      new Vector2(0, 4),
    ];
    const faces = ShapeUtils.triangulateShape(outline, []);
    expect(faces).toHaveLength(3);
    expect(new Set(faces.flat())).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('measures a polygon area signed by its winding', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(ShapeUtils.area(square)).toBe(4);
    expect(ShapeUtils.area(square.toReversed())).toBe(-4);
  });

  it('builds indexed buffer geometry that the renderer can bound without a browser', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0, -1]), 3),
    );
    geometry.setIndex(new BufferAttribute(Uint32Array.from([0, 1, 2]), 1));
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.max.toArray()).toEqual([1, 0, 0]);
    expect(geometry.boundingBox?.min.toArray()).toEqual([0, 0, -1]);
    expect(geometry.index?.count).toBe(3);
  });

  it('lets a disposed renderer go when a texture it uploaded outlives it', () => {
    const texture = sharedTexture();
    const listeners = disposeListeners(texture);

    for (let visit = 0; visit < 3; visit += 1) {
      const renderer = new WebGLRenderer({ canvas: fakeSurface().canvas });
      renderer.initTexture(texture);
      expect(listeners.size).toBe(1);
      renderer.dispose();
    }

    expect(listeners.size).toBe(0);
  });

  it('lets a disposed renderer go when a material it drew outlives it', () => {
    const materials = [new MeshStandardMaterial(), new MeshBasicMaterial()];
    const listeners = materials.map((material) => disposeListeners(material));

    for (let visit = 0; visit < 3; visit += 1) {
      const renderer = new WebGLRenderer({ canvas: fakeSurface().canvas });
      const scene = new Scene();
      for (const material of materials) scene.add(new Mesh(new BoxGeometry(), material));
      renderer.render(scene, new PerspectiveCamera());
      expect(listeners.map((set) => set.size)).toStrictEqual([1, 1]);
      renderer.dispose();
    }

    expect(listeners.map((set) => set.size)).toStrictEqual([0, 0]);
  });

  it('still frees a texture on a live renderer when the texture is disposed', () => {
    const texture = sharedTexture();
    const surface = fakeSurface();
    const renderer = new WebGLRenderer({ canvas: surface.canvas });
    renderer.initTexture(texture);

    texture.dispose();

    expect(surface.deletedTextures()).toBe(1);
    renderer.dispose();
  });
});
