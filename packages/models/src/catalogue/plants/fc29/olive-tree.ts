import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { blob, lean, type Point } from '../../outdoor/fc25/kit';
import { ROOT, plantModel, potParts, stemPart } from '../fc27/kit';

const POT = { bottom: 0.22, top: 0.28, height: 0.42 } as const;
const BASE: Point = [0, 0.4, 0];

const TRUNK = [
  { length: 0.46, tilt: 6, yaw: 30, radius: 0.045 },
  { length: 0.4, tilt: 14, yaw: 200, radius: 0.038 },
  { length: 0.36, tilt: 16, yaw: 100, radius: 0.03 },
] as const;

const BRANCHES = [
  { at: 1, length: 0.4, tilt: 44, yaw: 20 },
  { at: 1, length: 0.36, tilt: 40, yaw: 250 },
  { at: 2, length: 0.34, tilt: 38, yaw: 150 },
] as const;

function trunk(): { readonly parts: ModelSpecPart[]; readonly joints: Point[] } {
  let from: Point = BASE;
  const joints: Point[] = [from];
  const parts = TRUNK.map((segment, index) => {
    const part = stemPart(`trunk${String(index + 1)}`, { from, ...segment }, 'accent');
    from = lean(from, segment.length, segment.tilt, segment.yaw);
    joints.push(from);
    return part;
  });
  return { parts, joints };
}

function crown(joints: readonly Point[]): ModelSpecPart[] {
  const parts: ModelSpecPart[] = [];
  const top = joints[joints.length - 1] ?? BASE;
  parts.push(
    blob('crownTop', 'leaf', [0.3, 0.2, 0.28], {
      at: [top[0], top[1] + 0.12, top[2]],
      parent: ROOT,
      segments: 28,
    }),
  );
  BRANCHES.forEach((branch, index) => {
    const from = joints[branch.at] ?? BASE;
    const end = lean(from, branch.length, branch.tilt, branch.yaw);
    const name = String(index + 1);
    parts.push(
      stemPart(
        `branch${name}`,
        { from, length: branch.length, tilt: branch.tilt, yaw: branch.yaw, radius: 0.018 },
        'accent',
      ),
      blob(`crown${name}`, 'leaf', [0.24, 0.17, 0.23], {
        at: [end[0], end[1] + 0.08, end[2]],
        parent: ROOT,
        segments: 28,
      }),
    );
  });
  return parts;
}

function oliveParts(): ModelSpecPart[] {
  const stem = trunk();
  return [...potParts(POT), ...stem.parts, ...crown(stem.joints)];
}

export const OLIVE_TREE_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.olive-tree',
  title: 'Olive tree',
  footprint: { width: 1, depth: 0.8, height: 1.92 },
  names: {
    display: 'Olive tree',
    synonyms: ['olive tree', 'potted olive', 'mediterranean tree', 'indoor tree', 'olea'],
  },
  sizeClass: 'tall',
  materials: {
    leaf: colorMaterial('#8A9C6E', { roughness: 0.7, sheen: 0.4 }),
    accent: colorMaterial('#6E5B48', { roughness: 0.9, pattern: 'ribbed' }),
  },
  parts: oliveParts(),
});
