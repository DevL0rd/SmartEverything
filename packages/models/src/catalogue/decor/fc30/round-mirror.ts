import type { ModelSpec } from '@smarteverything/domain';
import { BRASS, MIRROR_GLASS, by, cyl, decorItem, finishesOf, hoop } from './kit';

export const ROUND_MIRROR_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.round-mirror',
  title: 'Round mirror',
  footprint: { width: 0.7, depth: 0.036, height: 0.745 },
  size: {
    width: { param: 'diameter', extra: 0, resizes: true },
    height: { param: 'diameter', extra: 0.045, resizes: false },
  },
  meta: {
    names: {
      display: 'Round mirror',
      synonyms: [
        'circular mirror',
        'wall mirror',
        'round wall mirror',
        'mirror',
        'porthole mirror',
      ],
    },
    sizeClass: 'medium',
  },
  params: { diameter: { min: 0.4, max: 1.2, default: 0.7, unit: 'm' } },
  materials: {
    frame: { finish: 'satin-black' },
    mirror: MIRROR_GLASS,
    accent: { color: '#9A6B43', roughness: 0.6, pattern: 'leather' },
  },
  finish: finishesOf(
    {
      black: {},
      brass: { frame: BRASS },
      oak: { frame: { finish: 'oak' } },
      walnut: { frame: { finish: 'walnut' } },
    },
    'black',
  ),
  mount: 'wall',
  parts: [
    cyl(
      'backing',
      'frame',
      { height: 0.028, top: by('diameter', 0.5, -0.02), bevel: 0.004, segments: 96 },
      { at: [0, by('diameter', 0.5), 0], turn: [90, 0, 0], contact: true },
    ),
    hoop(
      'rim',
      'frame',
      { radius: by('diameter', 0.5, -0.018), tube: 0.018, segments: 96 },
      { at: [0, by('diameter', 0.5), 0] },
    ),
    cyl(
      'glass',
      'mirror',
      { height: 0.004, top: by('diameter', 0.5, -0.034), bevel: 0.001, segments: 96 },
      { at: [0, by('diameter', 0.5), 0.0125], turn: [90, 0, 0] },
    ),
    hoop(
      'strap',
      'accent',
      { radius: 0.028, tube: 0.005, segments: 32 },
      { at: [0, by('diameter', 1, 0.012), -0.006], minLod: 1 },
    ),
  ],
});
