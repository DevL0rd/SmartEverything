import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, piece, upholsteryFinishes, upholsteryOf, woodOf } from '../../living/fc06/kit';
import { bedroomItem } from '../fc14/kit';

const THICK = 0.1;
const LEG = 0.25;
const CHANNELS = 7;

function parts(): ModelSpecPart[] {
  const panelY = by('height', 0.5, LEG);
  return [
    block('panel', 'panel', [by('width', 1), by('height', 1), THICK], {
      at: [0, panelY, 0],
      round: 0.05,
    }),
    piece(
      'channels',
      'panel',
      {
        type: 'slats',
        count: CHANNELS,
        spacing: by('width', 1 / (CHANNELS + 1)),
        width: by('height', 1, -0.14),
        height: by('width', 1 / (CHANNELS + 1), -0.014),
        depth: 0.03,
      },
      { at: [0, panelY, THICK / 2 + 0.008], turn: [0, 0, 90], minLod: 1 },
    ),
    ...[-1, 1].map((side) =>
      block(`leg${side < 0 ? 'Left' : 'Right'}`, 'frame', [0.06, LEG + 0.02, 0.06], {
        at: [by('width', side / 2, -side * 0.09), (LEG + 0.02) / 2, -0.01],
        round: 0.012,
        segments: 3,
        contact: true,
      }),
    ),
    block('rail', 'frame', [by('width', 1, -0.1), 0.03, 0.07], {
      at: [0, LEG - 0.02, -0.01],
      round: 0.01,
      segments: 3,
      minLod: 1,
    }),
  ];
}

export const UPHOLSTERED_HEADBOARD_MODEL: ModelSpec = bedroomItem({
  id: 'cat.bedroom.upholstered-headboard',
  title: 'Upholstered headboard',
  footprint: { width: 1.6, depth: THICK, height: 1.1 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', extra: 0.25, resizes: true },
  },
  meta: {
    names: {
      display: 'Upholstered headboard',
      synonyms: [
        'headboard',
        'padded headboard',
        'tufted headboard',
        'bed head',
        'fabric headboard',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.bedroom.headboard'],
  },
  params: {
    width: { min: 0.9, max: 2.1, default: 1.6, unit: 'm' },
    height: { min: 0.6, max: 1.2, default: 0.85, unit: 'm' },
  },
  materials: {
    panel: upholsteryOf('slate'),
    frame: woodOf('oak'),
  },
  finishes: upholsteryFinishes(['panel']),
  defaultFinish: 'slate',
  pitch: 16,
  wall: true,
  parts: parts(),
});
