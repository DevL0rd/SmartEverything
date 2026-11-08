import {
  AdditiveBlending,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
} from 'three';

export type GlowSurface = 'floor' | 'wall';

export interface GlowPixels {
  readonly size: number;
  readonly data: Uint8Array;
}

export interface GlowLook {
  readonly color: string;
  readonly intensity: number;
  readonly spreadM: number;
}

export interface GlowDecal {
  readonly surface: GlowSurface;
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly apply: (look: GlowLook | null) => void;
  readonly dispose: () => void;
}

export interface GlowDecalFactory {
  readonly create: (surface: GlowSurface, name: string) => GlowDecal;
  readonly dispose: () => void;
}

export const GLOW_RESOLUTION = 64;

export const GLOW_LIFT = 0.001;

export const GLOW_PEAK_OPACITY = 0.85;

export function glowStrength(intensity: number): number {
  const amount = Math.max(0, intensity);
  return amount / (1 + amount);
}

export function glowPixels(size: number): GlowPixels {
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = ((column + 0.5) / size - 0.5) * 2;
      const y = ((row + 0.5) / size - 0.5) * 2;
      const falloff = Math.max(0, 1 - Math.hypot(x, y));
      const at = (row * size + column) * 4;
      data.fill(255, at, at + 3);
      data[at + 3] = Math.round(falloff * falloff * 255);
    }
  }
  return { size, data };
}

export function glowTexture(pixels: GlowPixels): DataTexture {
  const texture = new DataTexture(
    pixels.data,
    pixels.size,
    pixels.size,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createDecal(
  surface: GlowSurface,
  name: string,
  geometry: PlaneGeometry,
  texture: DataTexture,
): GlowDecal {
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = 1;
  mesh.visible = false;
  if (surface === 'floor') mesh.rotation.x = -Math.PI / 2;
  return {
    surface,
    mesh,
    apply: (look): void => {
      const strength = look === null ? 0 : glowStrength(look.intensity);
      mesh.visible = look !== null && strength > 0;
      if (look === null || !mesh.visible) return;
      material.color.set(look.color);
      material.opacity = strength * GLOW_PEAK_OPACITY;
      mesh.scale.setScalar(look.spreadM * 2 * (0.6 + 0.4 * strength));
    },
    dispose: (): void => {
      mesh.removeFromParent();
      material.dispose();
    },
  };
}

export function createGlowDecalFactory(): GlowDecalFactory {
  const geometry = new PlaneGeometry(1, 1);
  const texture = glowTexture(glowPixels(GLOW_RESOLUTION));
  return {
    create: (surface, name) => createDecal(surface, name, geometry, texture),
    dispose: (): void => {
      geometry.dispose();
      texture.dispose();
    },
  };
}
