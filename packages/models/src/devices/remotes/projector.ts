import type { ModelSpec } from '@smarteverything/domain';
import { COOL, LIGHT_BODY, POWER, WARM, dpad, faceOf, halo, key, lit, pill, remote } from './kit';

const SIZE = { length: 0.132, width: 0.044, height: 0.017 };
const FACE = faceOf(SIZE);
const LENS = FACE.at(0.112, 0);

export const PROJECTOR_REMOTE_MODEL: ModelSpec = remote({
  id: 'dev.remote.projector',
  title: 'Projector remote',
  synonyms: ['beamer remote', 'projector controller', 'home cinema remote', 'presentation remote'],
  size: SIZE,
  materials: LIGHT_BODY,
  finishes: { white: {}, black: { body: { finish: 'satin-black' }, keys: { finish: 'graphite' } } },
  defaultFinish: 'white',
  parts: [
    key('power', [0.0052, FACE.at(0.02, 0.012)]),
    halo('powerHalo', [0.0056, 0.0066, FACE.at(0.02, 0.012, 0.0026)]),
    pill('input', [0.009, 0.016, FACE.at(0.02, -0.009)]),
    ...dpad('pad', [0.0135, FACE.at(0.056, 0)]),
    pill('focus', [0.012, 0.0135, FACE.at(0.088, 0.0095)], 'keys', { minLod: 1 }),
    pill('keystone', [0.012, 0.0135, FACE.at(0.088, -0.0095)], 'keys', { minLod: 1 }),
    key('lens', [0.0066, LENS], 'glass'),
    halo('lensRing', [0.0068, 0.0079, [LENS[0], LENS[1] + 0.0026, LENS[2]]]),
  ],
  channels: [
    ...lit('powerHalo', POWER, 0.8),
    ...lit('padHalo', COOL, 1),
    ...lit('lensRing', WARM, 1),
  ],
});
