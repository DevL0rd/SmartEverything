import type { ModelSpec } from '@smarteverything/domain';
import { part } from '../../helpers/geometry';
import { puck } from '../energy/kit';
import { LIGHT_BODY, WARM, faceOf, halo, key, lit, pill, remote } from './kit';

const SIZE = { length: 0.1, width: 0.044, height: 0.016 };
const FACE = faceOf(SIZE);
const WHEEL = FACE.at(0.052, 0);
const SWATCHES = ['#F2716A', '#6FD38E', '#6FA8FF', '#F4EEE2'];

export const LIGHT_REMOTE_MODEL: ModelSpec = remote({
  id: 'dev.remote.light',
  title: 'Light remote',
  synonyms: ['lamp remote', 'dimmer remote', 'LED strip remote', 'bulb remote', 'light controller'],
  size: SIZE,
  materials: { ...LIGHT_BODY, body: { finish: 'graphite', clearcoat: 0.4 } },
  finishes: { black: {}, white: { body: { finish: 'matte-white' } } },
  defaultFinish: 'black',
  parts: [
    pill('on', [0.011, 0.016, FACE.at(0.019, 0.01)]),
    pill('off', [0.011, 0.016, FACE.at(0.019, -0.01)]),
    puck('onMark', [0.0016, 0.0008, 0.0003], 'accent', { at: FACE.at(0.019, 0.01, 0.0028) }),
    part('wheel', { type: 'torus', radius: 0.0128, tube: 0.0034, segments: 36 }, 'keys', {
      transform: { position: [WHEEL[0], WHEEL[1] + 0.0016, WHEEL[2]], rotation: [90, 0, 0] },
    }),
    halo('wheelGlow', [0.0064, 0.0088, WHEEL]),
    key('bulb', [0.0056, WHEEL], 'body'),
    puck('bulbCore', [0.0026, 0.0008, 0.0003], 'accent', {
      at: [WHEEL[0], WHEEL[1] + 0.0038, WHEEL[2]],
      segments: 20,
    }),
    ...SWATCHES.flatMap((_, index) => {
      const at = FACE.at(0.085, 0.0156 - index * 0.0104);
      return [
        key(`swatch${String(index)}`, [0.0036, at], 'keys', { minLod: 1 }),
        halo(`swatchRing${String(index)}`, [0.0038, 0.0047, [at[0], at[1] + 0.0026, at[2]]], {
          minLod: 1,
        }),
      ];
    }),
  ],
  channels: [
    ...lit('onMark', WARM, 0.9),
    ...lit('wheelGlow', WARM, 1.1),
    ...lit('bulbCore', WARM, 1.2),
    ...SWATCHES.flatMap((colour, index) => lit(`swatchRing${String(index)}`, colour, 0.9)),
  ],
});
