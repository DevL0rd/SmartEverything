import {
  DataTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  RepeatWrapping,
  type BufferGeometry,
} from 'three';
import type { MeshLayer } from './vacuum-geometry';
import { layerGeometry } from './render-core-orbit';

const HATCH_SIZE = 8;

const HATCH_STRIPE = 3;

const HATCH_LIGHT = 255;

const HATCH_DARK = 190;

const OPAQUE = 1;

function hatchTexture(): DataTexture {
  const data = new Uint8Array(HATCH_SIZE * HATCH_SIZE * 4);
  for (let row = 0; row < HATCH_SIZE; row += 1) {
    for (let column = 0; column < HATCH_SIZE; column += 1) {
      const value = (row + column) % HATCH_SIZE < HATCH_STRIPE ? HATCH_DARK : HATCH_LIGHT;
      data.set([value, value, value, HATCH_LIGHT], (row * HATCH_SIZE + column) * 4);
    }
  }
  const texture = new DataTexture(data, HATCH_SIZE, HATCH_SIZE);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function materialFor(layer: MeshLayer): MeshLambertMaterial {
  const translucent = layer.opacity < OPAQUE;
  return new MeshLambertMaterial({
    vertexColors: true,
    side: DoubleSide,
    transparent: translucent,
    opacity: layer.opacity,
    depthWrite: !translucent,
    map: layer.id === 'carpets' ? hatchTexture() : null,
  });
}

export type LayerMesh = Mesh<BufferGeometry, MeshLambertMaterial>;

export function meshesForLayers(layers: readonly MeshLayer[]): readonly LayerMesh[] {
  return layers.map((layer) => {
    const mesh: LayerMesh = new Mesh(layerGeometry(layer), materialFor(layer));
    mesh.name = layer.id;
    mesh.renderOrder = layer.opacity < OPAQUE ? 1 : 0;
    return mesh;
  });
}

export class LayerSlot {
  readonly group = new Group();
  private meshes: readonly LayerMesh[] = [];

  replace(layers: readonly MeshLayer[]): void {
    this.release();
    this.meshes = meshesForLayers(layers);
    if (this.meshes.length > 0) {
      this.group.add(...this.meshes);
    }
  }

  named(name: string): LayerMesh | undefined {
    return this.meshes.find((mesh) => mesh.name === name);
  }

  release(): void {
    for (const mesh of this.meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
    this.meshes = [];
  }
}
