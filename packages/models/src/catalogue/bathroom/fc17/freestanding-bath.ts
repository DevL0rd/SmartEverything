import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { by, piece, rod } from '../../living/fc06/kit';
import { bathroomItem } from './kit';

const WIDTH = 0.8;
const RIM_Y = 0.6;
const FOOT = 0.035;

function shell(): ModelSpecPart {
  return piece(
    'shell',
    'ware',
    {
      type: 'lathe',
      profile: [
        [0, FOOT],
        [0.33, FOOT],
        [0.37, 0.06],
        [0.45, 0.3],
        [0.495, RIM_Y - 0.02],
        [0.5, RIM_Y - 0.008],
        [0.485, RIM_Y],
        [0.455, RIM_Y - 0.006],
        [0.42, 0.52],
        [0.34, 0.22],
        [0.21, 0.125],
        [0, 0.11],
      ],
      segments: 72,
    },
    { scale: [by('length', 1), 1, WIDTH], contact: true },
  );
}

function feet(): ModelSpecPart[] {
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) =>
      rod(
        `foot${String((sx + 1) / 2)}${String((sz + 1) / 2)}`,
        'accent',
        { height: FOOT + 0.01, top: 0.036, bottom: 0.03, segments: 24 },
        { at: [by('length', sx * 0.24), (FOOT + 0.01) / 2, sz * 0.17], contact: true },
      ),
    ),
  );
}

function filler(): ModelSpecPart[] {
  const end = by('length', 0.445);
  return [
    rod(
      'fillerBase',
      'accent',
      { height: 0.02, top: 0.026, bottom: 0.032, segments: 32 },
      {
        at: [end, RIM_Y + 0.01, 0],
      },
    ),
    rod(
      'fillerColumn',
      'accent',
      { height: 0.17, top: 0.012, bottom: 0.014, segments: 24 },
      {
        at: [end, RIM_Y + 0.105, 0],
      },
    ),
    rod(
      'fillerSpout',
      'accent',
      { height: 0.13, top: 0.011, segments: 24 },
      {
        at: [by('length', 0.445, -0.065), RIM_Y + 0.185, 0],
        turn: [0, 0, 90],
      },
    ),
    rod(
      'fillerLever',
      'accent',
      { height: 0.06, top: 0.008, segments: 16 },
      {
        at: [by('length', 0.445, -0.03), RIM_Y + 0.12, 0.03],
        turn: [90, 0, 0],
        minLod: 1,
      },
    ),
    rod(
      'drain',
      'accent',
      { height: 0.006, top: 0.034, segments: 32 },
      {
        at: [by('length', -0.2), 0.126, 0],
        minLod: 1,
      },
    ),
  ];
}

export const FREESTANDING_BATH_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.freestanding-bath',
  title: 'Freestanding bath',
  footprint: { width: 1.7, depth: WIDTH, height: RIM_Y + 0.2 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Freestanding bath',
      synonyms: [
        'freestanding bathtub',
        'slipper bath',
        'oval bath',
        'standalone tub',
        'soaking tub',
        'bathtub',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.bathroom.bathtub'],
  },
  params: { length: { min: 1.5, max: 1.9, default: 1.7, unit: 'm' } },
  materials: {
    ware: { finish: 'ceramic' },
    accent: { finish: 'chrome' },
  },
  roles: { ware: 'ware', accent: 'fixture' },
  pitch: 24,
  parts: [shell(), ...feet(), ...filler()],
});
