import type { ModelSpec } from '@smarteverything/domain';
import { block, by, leather } from '../../living/fc06/kit';
import { officeItem } from '../fc19/kit';

const THICK = 0.004;

const LOOKS = {
  charcoal: { mat: '#2F3136', inlay: '#3A3D42', thread: '#B8975A' },
  sand: { mat: '#BFB095', inlay: '#CDBFA6', thread: '#6B5A3E' },
  navy: { mat: '#2B3A57', inlay: '#344566', thread: '#E0D2B4' },
  forest: { mat: '#34503F', inlay: '#3E5A49', thread: '#E0D2B4' },
} as const;

const FINISHES = Object.fromEntries(
  Object.entries(LOOKS).map(([name, look]) => [
    name,
    {
      mat: leather(look.mat),
      inlay: leather(look.inlay),
      accent: { color: look.thread, roughness: 0.8 },
    },
  ]),
);

export const DESK_MAT_MODEL: ModelSpec = officeItem({
  id: 'cat.office.desk-mat',
  title: 'Desk mat',
  footprint: { width: 0.9, depth: 0.4, height: 0.008 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Desk mat',
      synonyms: [
        'mouse mat',
        'mouse pad',
        'desk pad',
        'leather desk mat',
        'keyboard mat',
        'writing pad',
      ],
    },
    sizeClass: 'small',
    aliases: ['cat.office.mouse-mat'],
  },
  params: {
    width: { min: 0.6, max: 1.2, default: 0.9, unit: 'm' },
    depth: { min: 0.25, max: 0.5, default: 0.4, unit: 'm' },
  },
  materials: {
    mat: leather(LOOKS.charcoal.mat),
    inlay: leather(LOOKS.charcoal.inlay),
    accent: { color: LOOKS.charcoal.thread, roughness: 0.8 },
  },
  finishes: FINISHES,
  defaultFinish: 'charcoal',
  pitch: 36,
  mount: 'desk',
  parts: [
    block('mat', 'mat', [by('width', 1), THICK, by('depth', 1)], {
      at: [0, THICK / 2, 0],
      round: 0.0018,
      segments: 3,
    }),
    block('inlay', 'inlay', [by('width', 1, -0.03), 0.003, by('depth', 1, -0.03)], {
      at: [0, THICK + 0.001, 0],
      round: 0.001,
      segments: 3,
    }),
    ...([-1, 1] as const).flatMap((side) => {
      const name = side < 0 ? 'Back' : 'Front';
      return [
        block(`stitch${name}`, 'accent', [by('width', 1, -0.05), 0.0012, 0.0022], {
          at: [0, THICK + 0.0024, by('depth', side * 0.5, -side * 0.0105)],
          round: 0.0005,
          segments: 3,
          minLod: 1,
        }),
        block(
          `stitch${side < 0 ? 'Left' : 'Right'}`,
          'accent',
          [0.0022, 0.0012, by('depth', 1, -0.05)],
          {
            at: [by('width', side * 0.5, -side * 0.0105), THICK + 0.0024, 0],
            round: 0.0005,
            segments: 3,
            minLod: 1,
          },
        ),
      ];
    }),
  ],
});
