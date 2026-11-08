import type { ModelSpec } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { COOL, DARK_BODY, POWER, dpad, faceOf, grid, halo, key, lit, pill, remote } from './kit';

const SIZE = { length: 0.19, width: 0.048, height: 0.018 };
const FACE = faceOf(SIZE);
const COLOURS = ['#F2716A', '#6FD38E', '#F2D16A', '#6FA8FF'];

export const SET_TOP_REMOTE_MODEL: ModelSpec = remote({
  id: 'dev.remote.settop',
  title: 'Set-top box remote',
  synonyms: [
    'cable box remote',
    'satellite remote',
    'TV box remote',
    'streaming box remote',
    'decoder remote',
  ],
  size: SIZE,
  materials: DARK_BODY,
  finishes: { black: {}, white: { body: { finish: 'matte-white' }, keys: { color: '#AEB2B8' } } },
  defaultFinish: 'black',
  parts: [
    key('power', [0.005, FACE.at(0.018, 0.014)]),
    halo('powerHalo', [0.0054, 0.0064, FACE.at(0.018, 0.014, 0.0026)]),
    pill('guide', [0.009, 0.016, FACE.at(0.018, -0.008)], 'keys', { minLod: 1 }),
    ...dpad('pad', [0.0152, FACE.at(0.052, 0)]),
    key('back', [0.0042, FACE.at(0.084, -0.014)], 'keys', { minLod: 1 }),
    key('menu', [0.0042, FACE.at(0.098, -0.014)], 'keys', { minLod: 1 }),
    pill('channel', [0.028, 0.0105, FACE.at(0.091, 0.012)]),
    ...COLOURS.map((_, index) =>
      box(`colour${String(index)}`, [0.0042, 0.0012, 0.0078, 0.0009], 'accent', {
        at: FACE.at(0.115, 0.0153 - index * 0.0102, 0.0004),
      }),
    ),
    ...grid('number', [[0.0125, 0, -0.0125], [0.13, 0.142, 0.154, 0.166], 0.0037], FACE),
  ],
  channels: [
    ...lit('powerHalo', POWER, 0.8),
    ...lit('padHalo', COOL, 1),
    ...COLOURS.flatMap((colour, index) => lit(`colour${String(index)}`, colour, 0.8)),
  ],
});
