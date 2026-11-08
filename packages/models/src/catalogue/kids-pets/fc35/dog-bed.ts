import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { blob, by, catalogueItem, fabricFinishes, hoop, piece, rod } from './kit';

const BASE_H = 0.04;
const TUBE = 0.075;
const CUSHION_H = 0.07;

function bone(): ModelSpecPart[] {
  const y = BASE_H + CUSHION_H + 0.006;
  const ends = ([-1, 1] as const).flatMap((end) =>
    ([-1, 1] as const).map((side) =>
      blob(
        `knob${end < 0 ? 'A' : 'B'}${side < 0 ? 'Left' : 'Right'}`,
        'accent',
        [0.018, 0.012, 0.018],
        { at: [end * 0.07, y, side * 0.014], minLod: 1 },
      ),
    ),
  );
  return [
    piece(
      'boneShaft',
      'accent',
      { type: 'capsule', radius: 0.012, length: 0.14, segments: 16 },
      { at: [0, y, 0], turn: [0, 0, 90], scale: [1, 0.6, 1], minLod: 1 },
    ),
    ...ends,
  ];
}

export const DOG_BED_MODEL: ModelSpec = catalogueItem({
  id: 'cat.kids-pets.dog-bed',
  title: 'Dog bed',
  category: 'kids-pets',
  footprint: { width: 0.8, depth: 0.8, height: BASE_H + 2 * TUBE - 0.012 },
  size: {
    width: { param: 'size', extra: 0, resizes: true },
    depth: { param: 'size', extra: 0, resizes: true },
  },
  view: { yaw: 30, pitch: 26, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Dog bed',
      synonyms: ['pet bed', 'dog cushion', 'bolster bed', 'cat bed', 'pet cushion'],
    },
    sizeClass: 'small',
    aliases: ['cat.kids-pets.pet-bed'],
  },
  params: { size: { min: 0.5, max: 1.2, default: 0.8, unit: 'm' } },
  materials: {
    body: { color: '#CBBDA5', roughness: 0.9, sheen: 0.8, pattern: 'knit' },
    pad: { color: '#E4DAC8', roughness: 0.92, sheen: 0.7, pattern: 'knit' },
    trim: tokenMaterial('rubber'),
    accent: tokenMaterial('terracotta'),
  },
  finish: finishSet(fabricFinishes(['body', 'pad']), 'oat'),
  parts: [
    rod(
      'base',
      'trim',
      { height: BASE_H, top: by('size', 0.5), bevel: 0.015, segments: 48 },
      { at: [0, BASE_H / 2, 0], contact: true },
    ),
    hoop(
      'bolster',
      'body',
      { radius: by('size', 0.5, -TUBE - 0.01), tube: TUBE, segments: 48 },
      { at: [0, BASE_H + TUBE - 0.012, 0] },
    ),
    rod(
      'cushion',
      'pad',
      { height: CUSHION_H, top: by('size', 0.5, -TUBE * 1.5), bevel: 0.03, segments: 48 },
      { at: [0, BASE_H + CUSHION_H / 2, 0] },
    ),
    hoop(
      'stitch',
      'body',
      { radius: by('size', 0.5, -TUBE * 1.5 - 0.004), tube: 0.005, segments: 48 },
      { at: [0, BASE_H + CUSHION_H - 0.002, 0], minLod: 2 },
    ),
    ...bone(),
  ],
});
