import {
  AdditiveBlending,
  KeepStencilOp,
  NormalBlending,
  NotEqualStencilFunc,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Blending,
  type Camera,
  type DataTexture,
} from 'three';
import type { EmitterSource } from './emitters';
import { GLOW_RESOLUTION, glowPixels, glowTexture } from './glow-decal';
import { DRAW_ORDER } from './materials';
import { SILHOUETTE_STENCIL } from './silhouette';
import type { StageTheme } from './stage';

export interface EmitterHalos {
  readonly sprites: readonly Sprite[];
  readonly sync: () => void;
  readonly setTheme: (theme: StageTheme) => void;
  readonly dispose: () => void;
}

export const HALO_FLOOR = 0.35;

export const HALO_LOOK: Readonly<Record<StageTheme, { blending: Blending; opacity: number }>> = {
  light: { blending: NormalBlending, opacity: 0.6 },
  dark: { blending: AdditiveBlending, opacity: 0.9 },
};

export function haloStrength(intensity: number): number {
  if (intensity <= 0) return 0;
  return HALO_FLOOR + (1 - HALO_FLOOR) * Math.min(1, intensity);
}

export function haloDiameter(radius: number, strength: number): number {
  return radius * 2 * (0.7 + 0.3 * strength);
}

export function frameRoom(camera: Camera, world: Vector3): number {
  const view = world.clone().applyMatrix4(camera.matrixWorldInverse);
  const e = camera.projectionMatrix.elements;
  const w = e[3] * view.x + e[7] * view.y + e[11] * view.z + e[15];
  if (w <= 0) return 0;
  const ndcX = (e[0] * view.x + e[4] * view.y + e[8] * view.z + e[12]) / w;
  const ndcY = (e[1] * view.x + e[5] * view.y + e[9] * view.z + e[13]) / w;
  const roomX = ((1 - Math.abs(ndcX)) * w) / e[0];
  const roomY = ((1 - Math.abs(ndcY)) * w) / e[5];
  return Math.max(0, 2 * Math.min(roomX, roomY));
}

export function fitHalo(sprite: Sprite, diameter: number, camera: Camera): void {
  const room = frameRoom(camera, sprite.getWorldPosition(new Vector3()));
  const parentScale = sprite.parent?.getWorldScale(new Vector3()).x ?? 1;
  sprite.scale.setScalar(Math.min(diameter, room / parentScale));
  sprite.updateMatrixWorld();
}

function haloMaterial(texture: DataTexture, theme: StageTheme): SpriteMaterial {
  return new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: SILHOUETTE_STENCIL,
    stencilFunc: NotEqualStencilFunc,
    stencilFail: KeepStencilOp,
    stencilZFail: KeepStencilOp,
    stencilZPass: KeepStencilOp,
    blending: HALO_LOOK[theme].blending,
    toneMapped: false,
  });
}

export function createEmitterHalos(model: EmitterSource, theme: StageTheme): EmitterHalos {
  const texture = glowTexture(glowPixels(GLOW_RESOLUTION));
  let current = theme;
  const entries = model.emitters.map((emitter) => {
    const sprite = new Sprite(haloMaterial(texture, current));
    sprite.name = `${emitter.id}:halo`;
    sprite.renderOrder = DRAW_ORDER.halo;
    sprite.visible = false;
    sprite.frustumCulled = false;
    const entry = { emitter, sprite, diameter: 0 };
    sprite.onBeforeRender = (_renderer, _scene, camera): void => {
      fitHalo(sprite, entry.diameter, camera);
    };
    emitter.node.add(sprite);
    return entry;
  });
  return {
    sprites: entries.map((entry) => entry.sprite),
    sync: (): void => {
      for (const entry of entries) {
        const { emitter, sprite } = entry;
        const strength = emitter.on ? haloStrength(emitter.intensity) : 0;
        sprite.visible = strength > 0;
        if (!sprite.visible) continue;
        sprite.material.color.set(emitter.color);
        sprite.material.opacity = strength * HALO_LOOK[current].opacity;
        entry.diameter = haloDiameter(emitter.radius, strength);
        sprite.scale.setScalar(entry.diameter);
      }
    },
    setTheme: (next): void => {
      current = next;
      for (const { sprite } of entries) {
        sprite.material.blending = HALO_LOOK[next].blending;
        sprite.material.needsUpdate = true;
      }
    },
    dispose: (): void => {
      for (const { sprite } of entries) {
        sprite.removeFromParent();
        sprite.material.dispose();
      }
      texture.dispose();
    },
  };
}
