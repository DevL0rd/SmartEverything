import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { STORAGE_METAL, block, by, storageItem, woodOf } from './kit';

const WIDTH = 0.4;
const DEPTH = 0.3;
const BODY_H = 0.22;
const LID_H = 0.025;
const PITCH = BODY_H + LID_H;
const COUNT = 3;

function crate(index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const base = index * PITCH;
  const visible = by('boxes', 1, -index);
  const show = (part: ModelSpecPart): ModelSpecPart => ({ ...part, visible });
  return [
    show(
      block(`body${name}`, 'body', [WIDTH, BODY_H, DEPTH], {
        at: [0, base + BODY_H / 2, 0],
        round: 0.014,
        segments: 3,
        ...(index === 0 ? { contact: true } : {}),
      }),
    ),
    show(
      block(`lid${name}`, 'body', [WIDTH + 0.02, LID_H, DEPTH + 0.02], {
        at: [0, base + BODY_H + LID_H / 2, 0],
        round: 0.009,
        segments: 3,
      }),
    ),
    show(
      block(`grip${name}`, 'slot', [0.16, 0.034, 0.008], {
        at: [0, base + BODY_H * 0.68, DEPTH / 2 - 0.002],
        round: 0.008,
        segments: 3,
        minLod: 1,
      }),
    ),
    show(
      block(`sideGrip${name}`, 'slot', [0.008, 0.034, 0.12], {
        at: [WIDTH / 2 - 0.002, base + BODY_H * 0.68, 0],
        round: 0.008,
        segments: 3,
        minLod: 1,
      }),
    ),
  ];
}

export const STORAGE_BOXES_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.storage-boxes',
  title: 'Storage boxes',
  footprint: { width: WIDTH + 0.02, depth: DEPTH + 0.02, height: PITCH * COUNT },
  meta: {
    names: {
      display: 'Storage boxes',
      synonyms: ['storage crates', 'stacking boxes', 'lidded bins', 'storage bins', 'crate stack'],
    },
    sizeClass: 'medium',
    aliases: ['cat.storage.boxes', 'cat.storage.crates'],
  },
  params: { boxes: { min: 1, max: COUNT, default: COUNT, unit: 'count' } },
  materials: { body: woodOf('oak'), slot: STORAGE_METAL },
  slots: ['body'],
  parts: Array.from({ length: COUNT }, (_, index) => crate(index)).flat(),
});
