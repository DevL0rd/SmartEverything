import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { puck } from '../energy/kit';
import { COOL, LIGHT_BODY, POWER, faceOf, halo, key, lit, pill, remote } from './kit';

const SIZE = { length: 0.112, width: 0.042, height: 0.015 };
const FACE = faceOf(SIZE);
const HUB = FACE.at(0.05, 0, 0.0004);
const BLADES = [0, 120, 240];

function blade(degrees: number, index: number): ModelSpecPart {
  const angle = degrees * (Math.PI / 180);
  return box(`blade${String(index)}`, [0.0085, 0.0008, 0.0042, 0.0018], 'accent', {
    at: [HUB[0] + Math.cos(angle) * 0.0058, HUB[1] + 0.0004, HUB[2] + Math.sin(angle) * 0.0058],
    transform: { rotation: [0, -degrees - 18, 0] },
  });
}

export const FAN_REMOTE_MODEL: ModelSpec = remote({
  id: 'dev.remote.fan',
  title: 'Fan remote',
  synonyms: ['fan controller', 'ceiling fan remote', 'tower fan remote', 'fan handset'],
  size: SIZE,
  materials: LIGHT_BODY,
  finishes: { white: {}, sand: { body: { color: '#E4DCCB', roughness: 0.55 } } },
  defaultFinish: 'white',
  parts: [
    key('power', [0.0068, FACE.at(0.02, 0)]),
    halo('powerHalo', [0.0072, 0.0083, FACE.at(0.02, 0, 0.0026)]),
    puck('glyphPad', [0.0125, 0.0008, 0.0003], 'glass', { at: HUB, segments: 32 }),
    puck('hub', [0.0022, 0.0012, 0.0004], 'accent', {
      at: [HUB[0], HUB[1] + 0.0008, HUB[2]],
      segments: 16,
    }),
    ...BLADES.map(blade),
    ...[0, 1, 2].map((index) =>
      key(`speed${String(index)}`, [0.0042, FACE.at(0.078, 0.012 - index * 0.012)], 'keys', {
        minLod: 1,
      }),
    ),
    ...[0, 1, 2].map((index) =>
      box(`step${String(index)}`, [0.0016, 0.0007, 0.003 + index * 0.0014, 0.0004], 'accent', {
        at: FACE.at(0.068, 0.012 - index * 0.012, 0.0002),
        minLod: 1,
      }),
    ),
    pill('swing', [0.012, 0.014, FACE.at(0.097, 0.009)], 'keys', { minLod: 1 }),
    pill('timer', [0.012, 0.014, FACE.at(0.097, -0.009)], 'keys', { minLod: 1 }),
  ],
  channels: [
    ...lit('powerHalo', POWER, 0.8),
    ...lit('hub', COOL, 1),
    ...BLADES.flatMap((_, index) => lit(`blade${String(index)}`, COOL, 1)),
    ...[0, 1, 2].flatMap((index) => lit(`step${String(index)}`, COOL, 0.7)),
  ],
});
