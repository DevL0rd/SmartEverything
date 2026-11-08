import {
  SplatEdit,
  SplatEditRgbaBlendMode,
  SplatEditSdf,
  SplatEditSdfType,
} from '@sparkjsdev/spark';
import {
  AdditiveBlending,
  AmbientLight,
  Color,
  CustomBlending,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  PointLight,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SrcColorFactor,
  Sprite,
  SpriteMaterial,
  UnsignedByteType,
  WebGLRenderTarget,
  ZeroFactor,
  OneFactor,
  type Camera,
  type Object3D,
  type Texture,
} from 'three';
import type { DuskAmbient, FloorLighting } from '../../lighting';
import type { QualitySettings } from '../../live-visibility/quality-scaler';
import { createLightPoolLayer, type LightPoolLayer } from '../light-pools';
import {
  buildProxyMesh,
  createProxyMeshes,
  relightLights,
  type LampGlow,
  type ProxyFloor,
  type ProxyLight,
  type ProxyMeshes,
} from './proxy-mesh';

export const GLOW_SPLAT_GAIN = 0.6;

const GLOW_SOFT_EDGE_M = 0.15;

const GLOW_TEXTURE_PIXELS = 32;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export interface RelightQuality {
  readonly shadows: boolean;
}

export function relightQuality(settings: QualitySettings): RelightQuality {
  return {
    shadows:
      settings.splatScale === 1 &&
      settings.lodBias === 0 &&
      settings.decalLightShare === 0 &&
      settings.animationDivisor === 1,
  };
}

export function glowTexture(pixels: number): DataTexture {
  const data = new Uint8Array(pixels * pixels * 4);
  for (let row = 0; row < pixels; row += 1) {
    for (let column = 0; column < pixels; column += 1) {
      const dx = ((column + 0.5) / pixels) * 2 - 1;
      const dy = ((row + 0.5) / pixels) * 2 - 1;
      const fall = clamp01(1 - Math.hypot(dx, dy)) ** 2;
      const at = (row * pixels + column) * 4;
      data.fill(255, at, at + 3);
      data[at + 3] = Math.round(fall * 255);
    }
  }
  const texture = new DataTexture(data, pixels, pixels, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function lampGlowEdit(glows: readonly LampGlow[]): SplatEdit {
  const edit = new SplatEdit({
    name: 'relight-lamp-glow',
    rgbaBlendMode: SplatEditRgbaBlendMode.ADD_RGBA,
    softEdge: GLOW_SOFT_EDGE_M,
  });
  for (const glow of glows) {
    const sphere = new SplatEditSdf({
      type: SplatEditSdfType.SPHERE,
      radius: glow.radiusM,
      opacity: 0,
      color: new Color(glow.colour).multiplyScalar(glow.strength * GLOW_SPLAT_GAIN),
    });
    sphere.position.set(...glow.position);
    edit.addSdf(sphere);
  }
  return edit;
}

const QUAD_VERTEX = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const QUAD_FRAGMENT = `uniform sampler2D map;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0); }`;

function compositeQuad(map: Texture, multiply: boolean): Mesh<PlaneGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    uniforms: { map: { value: map } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: QUAD_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: multiply ? CustomBlending : AdditiveBlending,
  });
  if (multiply) {
    material.blendSrc = ZeroFactor;
    material.blendDst = SrcColorFactor;
    material.blendSrcAlpha = ZeroFactor;
    material.blendDstAlpha = OneFactor;
  }
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.name = multiply ? 'relight-multiply' : 'relight-glow';
  quad.frustumCulled = false;
  quad.renderOrder = multiply ? 0 : 1;
  return quad;
}

export function duskBackground(dusk: DuskAmbient): Color {
  return new Color(dusk.tint).multiplyScalar(dusk.ambientScale);
}

export interface RelightRenderer {
  readonly shadowMap: { enabled: boolean };
  autoClear: boolean;
  getPixelRatio(): number;
  getRenderTarget(): WebGLRenderTarget | null;
  setRenderTarget(target: WebGLRenderTarget | null): void;
  render(scene: Object3D, camera: Camera): void;
}

export interface RelightInput {
  readonly sceneKey: string;
  readonly floor: ProxyFloor;
  readonly lighting: FloorLighting;
  readonly quality: QualitySettings;
}

export interface RelightCounts {
  readonly bufferRenders: number;
  readonly composites: number;
}

export function sizeOfBuffer(
  width: number,
  height: number,
  scale: number,
): readonly [number, number] {
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export class Relight {
  readonly edits = new Group();
  private readonly lightScene = new Scene();
  private readonly glowScene = new Scene();
  private readonly composite = new Scene();
  private readonly flat = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly ambient = new AmbientLight(0xffffff, 0);
  private readonly lightTarget = new WebGLRenderTarget(1, 1, { type: UnsignedByteType });
  private readonly glowTarget = new WebGLRenderTarget(1, 1, { type: UnsignedByteType });
  private readonly quads = [
    compositeQuad(this.lightTarget.texture, true),
    compositeQuad(this.glowTarget.texture, false),
  ] as const;
  private readonly glowMap = glowTexture(GLOW_TEXTURE_PIXELS);
  private readonly pools: LightPoolLayer = createLightPoolLayer(null);
  private readonly lit = new Group();
  private proxy: ProxyMeshes | null = null;
  private proxyKey: string | null = null;
  private lightsKey: string | null = null;
  private viewKey: string | null = null;
  private quality: RelightQuality = { shadows: true };
  private version = 0;
  private active = false;
  private bufferRenders = 0;
  private composites = 0;

  constructor(private readonly renderer: RelightRenderer) {
    this.edits.name = 'relight-edits';
    this.lightScene.add(this.ambient, this.lit, this.pools.group);
    this.glowScene.background = new Color(0, 0, 0);
    this.composite.add(...this.quads);
  }

  counts(): RelightCounts {
    return { bufferRenders: this.bufferRenders, composites: this.composites };
  }

  isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): boolean {
    if (this.active === active) return false;
    this.active = active;
    this.edits.visible = active;
    if (!active) this.viewKey = null;
    return true;
  }

  update(input: RelightInput): boolean {
    const quality = relightQuality(input.quality);
    const proxyChanged = this.updateProxy(input, quality.shadows);
    const lightsChanged = this.updateLights(input, quality, proxyChanged);
    this.quality = quality;
    this.setDusk(input.lighting.dusk);
    const changed = proxyChanged || lightsChanged;
    if (changed) this.version += 1;
    return changed;
  }

  compose(camera: Camera, width: number, height: number): boolean {
    if (!this.active) return false;
    const [bufferWidth, bufferHeight] = sizeOfBuffer(width, height, this.renderer.getPixelRatio());
    const viewKey = [
      ...camera.matrixWorld.elements,
      ...camera.projectionMatrix.elements,
      bufferWidth,
      bufferHeight,
      this.version,
    ].join(',');
    const previous = this.renderer.getRenderTarget();
    if (viewKey !== this.viewKey) {
      this.viewKey = viewKey;
      this.renderBuffers(camera, bufferWidth, bufferHeight);
    }
    this.renderer.setRenderTarget(previous);
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.render(this.composite, this.flat);
    this.renderer.autoClear = autoClear;
    this.composites += 1;
    return true;
  }

  dispose(): void {
    this.active = false;
    this.proxy?.dispose();
    this.proxy = null;
    this.clearLit();
    this.pools.dispose();
    this.lightTarget.dispose();
    this.glowTarget.dispose();
    this.glowMap.dispose();
    for (const quad of this.quads) {
      quad.geometry.dispose();
      quad.material.dispose();
    }
    this.edits.removeFromParent();
  }

  private renderBuffers(camera: Camera, width: number, height: number): void {
    this.lightTarget.setSize(width, height);
    this.glowTarget.setSize(width, height);
    if (this.quality.shadows) this.renderer.shadowMap.enabled = true;
    this.renderer.setRenderTarget(this.lightTarget);
    this.renderer.render(this.lightScene, camera);
    this.renderer.setRenderTarget(this.glowTarget);
    this.renderer.render(this.glowScene, camera);
    this.bufferRenders += 1;
  }

  private updateProxy(input: RelightInput, shadows: boolean): boolean {
    const key = [input.sceneKey, input.floor.id, String(shadows)].join('|');
    if (key === this.proxyKey) return false;
    this.proxyKey = key;
    this.proxy?.dispose();
    this.proxy = createProxyMeshes(buildProxyMesh(input.floor), shadows);
    this.lightScene.add(this.proxy.lit);
    this.glowScene.add(this.proxy.occluder);
    return true;
  }

  private updateLights(input: RelightInput, quality: RelightQuality, force: boolean): boolean {
    const elevation = input.floor.elevation;
    const lights = relightLights(input.lighting, elevation, input.quality.decalLightShare);
    const key = [lights.key, String(quality.shadows)].join('|');
    const poolsChanged = this.pools.update({
      lighting: input.lighting,
      elevation,
      realDeviceIds: new Set(lights.real.map((light) => light.id)),
    });
    if (key === this.lightsKey && !force) return poolsChanged;
    this.lightsKey = key;
    this.clearLit();
    for (const light of lights.real) this.lit.add(pointLightOf(light, quality.shadows));
    for (const glow of lights.glows) this.glowScene.add(glowSpriteOf(glow, this.glowMap));
    this.edits.add(lampGlowEdit(lights.glows));
    return true;
  }

  private clearLit(): void {
    for (const child of [...this.lit.children]) child.removeFromParent();
    for (const child of [...this.glowScene.children]) {
      if (!(child instanceof Sprite)) continue;
      child.removeFromParent();
      child.material.dispose();
    }
    for (const child of [...this.edits.children]) child.removeFromParent();
  }

  private setDusk(dusk: DuskAmbient): void {
    this.lightScene.background = duskBackground(dusk);
    this.ambient.color.set(dusk.tint);
    this.ambient.intensity = Math.PI * dusk.ambientScale;
  }
}

function pointLightOf(light: ProxyLight, shadows: boolean): PointLight {
  const point = new PointLight(new Color(light.colour), light.intensity, light.distance, 2);
  point.name = `relight-light:${light.id}`;
  point.position.set(...light.position);
  point.castShadow = shadows;
  point.shadow.autoUpdate = false;
  point.shadow.needsUpdate = shadows;
  return point;
}

function glowSpriteOf(glow: LampGlow, map: Texture): Sprite {
  const sprite = new Sprite(
    new SpriteMaterial({
      map,
      color: new Color(glow.colour).multiplyScalar(glow.strength),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    }),
  );
  sprite.name = `relight-glow:${glow.id}`;
  sprite.position.set(...glow.position);
  sprite.scale.setScalar(glow.radiusM * 2);
  return sprite;
}
