import type { ModelSpec } from '@smarteverything/domain';
import { part } from '../../helpers/geometry';
import { puck } from '../energy/kit';
import { COOL, POWER, faceOf, halo, key, lit, pill, remote } from './kit';

const SIZE = { length: 0.15, width: 0.042, height: 0.015 };
const FACE = faceOf(SIZE);
const DIAL = FACE.at(0.056, 0);
const PLAY = FACE.at(0.098, 0);

export const SPEAKER_REMOTE_MODEL: ModelSpec = remote({
  id: 'dev.remote.speaker',
  title: 'Audio remote',
  synonyms: [
    'speaker remote',
    'soundbar remote',
    'amplifier remote',
    'receiver remote',
    'hi-fi remote',
  ],
  size: SIZE,
  materials: {
    body: { finish: 'brushed-aluminium', roughness: 0.36 },
    keys: { finish: 'satin-black', roughness: 0.5 },
    glass: { finish: 'smoked-acrylic', roughness: 0.12, clearcoat: 1 },
  },
  finishes: {
    silver: {},
    black: { body: { finish: 'graphite' }, keys: { finish: 'satin-black' } },
  },
  defaultFinish: 'silver',
  parts: [
    key('power', [0.0046, FACE.at(0.019, 0.011)]),
    halo('powerHalo', [0.005, 0.006, FACE.at(0.019, 0.011, 0.0026)]),
    pill('source', [0.009, 0.015, FACE.at(0.019, -0.009)]),
    part(
      'dial',
      {
        type: 'cylinder',
        height: 0.0034,
        topRadius: 0.0148,
        bottomRadius: 0.0152,
        bevel: 0.0011,
        segments: 48,
      },
      'keys',
      { transform: { position: [DIAL[0], DIAL[1] + 0.0015, DIAL[2]] } },
    ),
    halo('volumeArc', [0.0156, 0.0168, DIAL]),
    key('mute', [0.0058, [DIAL[0], DIAL[1] + 0.0016, DIAL[2]]], 'body'),
    key('previous', [0.0048, FACE.at(0.098, 0.0135)], 'keys', { minLod: 1 }),
    key('play', [0.0062, PLAY]),
    key('next', [0.0048, FACE.at(0.098, -0.0135)], 'keys', { minLod: 1 }),
    puck('playGlyph', [0.0034, 0.0008, 0.0002], 'accent', {
      at: [PLAY[0], PLAY[1] + 0.0029, PLAY[2]],
      segments: 3,
      transform: { rotation: [0, 90, 0] },
    }),
    pill('eq', [0.009, 0.026, FACE.at(0.126, 0)], 'keys', { minLod: 1 }),
  ],
  channels: [
    ...lit('powerHalo', POWER, 0.8),
    ...lit('volumeArc', COOL, 1),
    ...lit('playGlyph', COOL, 1.1),
  ],
});
