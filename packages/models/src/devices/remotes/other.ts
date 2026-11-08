import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { COOL, DARK_BODY, POWER, faceOf, halo, key, lit, pill, plate, remote } from './kit';

const SIZE = { length: 0.17, width: 0.05, height: 0.018 };
const FACE = faceOf(SIZE);
const ROWS = [0.082, 0.104, 0.126];
const COLUMNS = [0.0115, -0.0115];
const LABELS = ROWS.flatMap((row) => COLUMNS.map((column) => [row, column] as const));

function labelled([row, column]: readonly [number, number], index: number): ModelSpecPart[] {
  const id = `label${String(index)}`;
  return [
    pill(`button${String(index)}`, [0.014, 0.019, FACE.at(row, column)], 'keys', { minLod: 1 }),
    plate(id, [0.0024, 0.011, FACE.at(row, column, 0.0028)], { minLod: 1 }),
  ];
}

export const OTHER_REMOTE_MODEL: ModelSpec = remote({
  id: 'dev.remote.other',
  title: 'Universal remote',
  synonyms: [
    'IR remote',
    'infrared remote',
    'learning remote',
    'all in one remote',
    'remote control',
  ],
  size: SIZE,
  materials: DARK_BODY,
  finishes: { black: {}, white: { body: { finish: 'matte-white' }, keys: { color: '#AEB2B8' } } },
  defaultFinish: 'black',
  parts: [
    box('screen', [0.034, 0.0012, 0.04, 0.003], 'glass', { at: FACE.at(0.042, 0, 0.0004) }),
    box('lcd', [0.024, 0.0007, 0.032, 0.0016], 'accent', { at: FACE.at(0.042, 0, 0.0012) }),
    key('power', [0.0052, FACE.at(0.016, 0.014)]),
    halo('powerHalo', [0.0056, 0.0066, FACE.at(0.016, 0.014, 0.0026)]),
    pill('learn', [0.008, 0.016, FACE.at(0.016, -0.009)], 'keys', { minLod: 1 }),
    ...LABELS.flatMap(labelled),
    pill('rocker', [0.024, 0.032, FACE.at(0.154, 0)]),
  ],
  channels: [
    ...lit('powerHalo', POWER, 0.8),
    ...lit('lcd', COOL, 0.7),
    ...LABELS.flatMap((_, index) => lit(`label${String(index)}`, COOL, 0.6)),
  ],
});
