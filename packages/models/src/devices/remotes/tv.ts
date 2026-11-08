import type { ModelSpec } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { COOL, DARK_BODY, POWER, dpad, faceOf, grid, halo, key, lit, pill, remote } from './kit';

const SIZE = { length: 0.2, width: 0.046, height: 0.018 };
const FACE = faceOf(SIZE);

export const TV_REMOTE_MODEL: ModelSpec = remote({
  id: 'dev.remote.tv',
  title: 'TV remote',
  synonyms: ['television remote', 'TV controller', 'clicker', 'telly remote'],
  size: SIZE,
  materials: DARK_BODY,
  finishes: { black: {}, graphite: { body: { finish: 'graphite' } } },
  defaultFinish: 'black',
  parts: [
    key('power', [0.0055, FACE.at(0.018, 0)]),
    halo('powerHalo', [0.0059, 0.007, FACE.at(0.018, 0, 0.0026)]),
    ...grid('number', [[0.0125, 0, -0.0125], [0.038, 0.049, 0.06], 0.0034], FACE),
    ...dpad('pad', [0.0148, FACE.at(0.094, 0)]),
    pill('home', [0.008, 0.012, FACE.at(0.122, 0)], 'keys', { minLod: 1 }),
    pill('volume', [0.036, 0.0105, FACE.at(0.15, 0.0125)]),
    pill('channel', [0.036, 0.0105, FACE.at(0.15, -0.0125)]),
    box('volumeMark', [0.0024, 0.0008, 0.0024, 0.0005], 'accent', {
      at: FACE.at(0.138, 0.0125, 0.0028),
      minLod: 1,
    }),
    box('channelMark', [0.0024, 0.0008, 0.0024, 0.0005], 'accent', {
      at: FACE.at(0.138, -0.0125, 0.0028),
      minLod: 1,
    }),
  ],
  channels: [
    ...lit('powerHalo', POWER, 0.9),
    ...lit('padHalo', COOL, 1),
    ...lit('volumeMark', COOL, 0.8),
    ...lit('channelMark', COOL, 0.8),
  ],
});
