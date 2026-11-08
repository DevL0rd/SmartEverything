import type { ModelSpec } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { COOL, LIGHT_BODY, POWER, faceOf, grid, halo, key, lit, pill, remote } from './kit';

const SIZE = { length: 0.15, width: 0.054, height: 0.017 };
const FACE = faceOf(SIZE);

export const AC_REMOTE_MODEL: ModelSpec = remote({
  id: 'dev.remote.ac',
  title: 'Air conditioner remote',
  synonyms: [
    'AC remote',
    'air con remote',
    'climate remote',
    'split unit remote',
    'heat pump remote',
  ],
  size: SIZE,
  materials: LIGHT_BODY,
  finishes: { white: {}, grey: { body: { color: '#D9DBDE', roughness: 0.5 } } },
  defaultFinish: 'white',
  parts: [
    box('display', [0.04, 0.0012, 0.044, 0.003], 'glass', { at: FACE.at(0.034, 0, 0.0004) }),
    box('digitA', [0.02, 0.0007, 0.011, 0.0012], 'accent', { at: FACE.at(0.036, 0.007, 0.0012) }),
    box('digitB', [0.02, 0.0007, 0.011, 0.0012], 'accent', { at: FACE.at(0.036, -0.007, 0.0012) }),
    box('modes', [0.0045, 0.0007, 0.032, 0.0008], 'accent', {
      at: FACE.at(0.021, 0, 0.0012),
      minLod: 1,
    }),
    key('power', [0.0058, FACE.at(0.07, 0.014)]),
    halo('powerHalo', [0.0062, 0.0072, FACE.at(0.07, 0.014, 0.0026)]),
    pill('tempUp', [0.013, 0.015, FACE.at(0.064, -0.011)]),
    pill('tempDown', [0.013, 0.015, FACE.at(0.08, -0.011)]),
    box('tempMark', [0.0012, 0.0008, 0.007, 0.0004], 'glass', {
      at: FACE.at(0.064, -0.011, 0.0028),
      minLod: 2,
    }),
    ...grid('mode', [[0.015, 0, -0.015], [0.104, 0.122], 0.0044], FACE),
  ],
  channels: [
    ...lit('digitA', COOL, 1),
    ...lit('digitB', COOL, 1),
    ...lit('modes', COOL, 0.6),
    ...lit('powerHalo', POWER, 0.8),
  ],
});
