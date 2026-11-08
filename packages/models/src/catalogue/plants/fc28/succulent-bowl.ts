import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { blob, leafBlob } from '../../outdoor/fc25/kit';
import { ROOT, plantModel, potParts } from '../fc27/kit';

const POT = { bottom: 0.14, top: 0.22, height: 0.1 } as const;
const TOP = POT.height - 0.03;

interface Rosette {
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly accent: boolean;
}

const ROSETTES: readonly Rosette[] = [
  { x: 0, z: 0, scale: 1.15, accent: true },
  { x: 0.1, z: 0.07, scale: 0.85, accent: false },
  { x: -0.1, z: 0.06, scale: 0.9, accent: false },
  { x: 0.03, z: -0.11, scale: 0.8, accent: true },
  { x: -0.08, z: -0.07, scale: 0.7, accent: false },
];

interface Ring {
  readonly count: number;
  readonly tilt: number;
  readonly length: number;
  readonly offset: number;
  readonly minLod: 1 | 2;
}

const RINGS: readonly Ring[] = [
  { count: 6, tilt: 64, length: 0.052, offset: 0, minLod: 1 },
  { count: 5, tilt: 28, length: 0.04, offset: 36, minLod: 2 },
];

function petals(rosette: Rosette, index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const base = [rosette.x, TOP, rosette.z] as const;
  return RINGS.flatMap((ring) =>
    Array.from({ length: ring.count }, (_, step) =>
      leafBlob(
        `petal${name}${String(ring.minLod)}${String(step + 1)}`,
        'leaf',
        {
          base,
          length: ring.length * rosette.scale,
          width: 0.024 * rosette.scale,
          thick: 0.012,
          tilt: ring.tilt,
          yaw: ring.offset + step * (360 / ring.count),
          segments: 16,
        },
        { parent: ROOT, minLod: ring.minLod },
      ),
    ),
  );
}

function hearts(): ModelSpecPart[] {
  return ROSETTES.map((rosette, index) =>
    blob(
      `heart${String(index + 1)}`,
      rosette.accent ? 'accent' : 'leaf',
      [0.045 * rosette.scale, 0.03 * rosette.scale, 0.045 * rosette.scale],
      { at: [rosette.x, TOP + 0.02, rosette.z], parent: ROOT, segments: 20 },
    ),
  );
}

export const SUCCULENT_BOWL_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.succulent-bowl',
  title: 'Succulent bowl',
  footprint: { width: 0.46, depth: 0.46, height: 0.16 },
  view: { yaw: 30, pitch: 28, fov: 28, padding: 0.08 },
  names: {
    display: 'Succulent bowl',
    synonyms: [
      'succulent bowl',
      'succulents',
      'echeveria',
      'desert bowl',
      'small plant arrangement',
    ],
  },
  sizeClass: 'small',
  materials: {
    leaf: colorMaterial('#7FAE92', { roughness: 0.6, sheen: 0.3 }),
    accent: colorMaterial('#B88DA6', { roughness: 0.6 }),
  },
  parts: [...potParts(POT), ...hearts(), ...ROSETTES.flatMap(petals)],
});
