import {
  AlwaysStencilFunc,
  Color,
  DoubleSide,
  Mesh,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  ShaderMaterial,
  Vector2,
  Vector4,
  type Material,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { STAGE_RIGS, type StageTheme } from './stage';

interface EdgeUniforms {
  readonly tone: { readonly value: Color };
  readonly width: { value: number };
  readonly resolution: { readonly value: Vector2 };
}

export interface Silhouette {
  readonly material: ShaderMaterial;
  readonly uniforms: EdgeUniforms;
  readonly hulls: readonly Mesh[];
  readonly setTheme: (theme: StageTheme) => void;
  readonly dispose: () => void;
}

export const SILHOUETTE_WIDTH_PX = 1.25;

export const SILHOUETTE_STENCIL = 1;

export const SILHOUETTE_ORDER = 10;

const VERTEX = `
uniform vec2 resolution;
uniform float width;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec2 lean = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
  float reach = length(lean);
  vec2 outward = reach > 0.0 ? lean / reach : vec2(0.0);
  clip.xy += outward * width * 2.0 / resolution * clip.w;
  gl_Position = clip;
}
`;

const FRAGMENT = `
uniform vec3 tone;
void main() {
  gl_FragColor = vec4(tone, 1.0);
  #include <colorspace_fragment>
}
`;

function edgeUniforms(theme: StageTheme): EdgeUniforms {
  return {
    tone: { value: new Color(STAGE_RIGS[theme].edge) },
    width: { value: SILHOUETTE_WIDTH_PX },
    resolution: { value: new Vector2(1, 1) },
  };
}

function edgeMaterial(uniforms: EdgeUniforms): ShaderMaterial {
  return new ShaderMaterial({
    name: 'stage.silhouette',
    uniforms: { ...uniforms },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: SILHOUETTE_STENCIL,
    stencilFunc: NotEqualStencilFunc,
    stencilZPass: ReplaceStencilOp,
  });
}

export function markSilhouette(material: Material): void {
  Object.assign(material, {
    stencilWrite: true,
    stencilRef: SILHOUETTE_STENCIL,
    stencilFunc: AlwaysStencilFunc,
    stencilZPass: ReplaceStencilOp,
  });
}

function isMesh(node: Object3D): node is Mesh {
  return node instanceof Mesh;
}

function materialsOf(mesh: Mesh): readonly Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function modelMeshes(root: Object3D): readonly Mesh[] {
  const found: Mesh[] = [];
  root.traverse((node) => {
    if (isMesh(node) && materialsOf(node).every((material) => material.depthWrite)) {
      found.push(node);
    }
  });
  return found;
}

export function createSilhouette(root: Object3D, theme: StageTheme): Silhouette {
  const uniforms = edgeUniforms(theme);
  const material = edgeMaterial(uniforms);
  const viewport = new Vector4();
  const hulls = modelMeshes(root).map((mesh) => {
    for (const each of materialsOf(mesh)) markSilhouette(each);
    const hull = new Mesh(mesh.geometry, material);
    hull.name = `${mesh.name}:silhouette`;
    hull.renderOrder = SILHOUETTE_ORDER;
    hull.onBeforeRender = (renderer: WebGLRenderer): void => {
      renderer.getCurrentViewport(viewport);
      uniforms.resolution.value.set(viewport.z, viewport.w);
      uniforms.width.value = SILHOUETTE_WIDTH_PX * renderer.getPixelRatio();
      material.uniformsNeedUpdate = true;
    };
    mesh.add(hull);
    return hull;
  });
  return {
    material,
    uniforms,
    hulls,
    setTheme: (next): void => {
      uniforms.tone.value.set(STAGE_RIGS[next].edge);
    },
    dispose: (): void => {
      for (const hull of hulls) hull.removeFromParent();
      material.dispose();
    },
  };
}
