import type { ModelSpec } from '@smarteverything/domain';
import { block, rod, woodOf } from '../../living/fc06/kit';
import { deskFinishes, officeItem } from '../fc19/kit';

const BASE = 0.02;

export const DESK_ORGANISER_MODEL: ModelSpec = officeItem({
  id: 'cat.office.desk-organiser',
  title: 'Desk organiser',
  footprint: { width: 0.26, depth: 0.15, height: 0.16 },
  meta: {
    names: {
      display: 'Desk organiser',
      synonyms: [
        'desk tidy',
        'pen holder',
        'stationery organiser',
        'pencil cup',
        'desktop organizer',
      ],
    },
    sizeClass: 'small',
    aliases: ['cat.office.desk-tidy'],
  },
  materials: {
    body: woodOf('oak'),
    cup: { finish: 'graphite' },
    accent: { color: '#C8362E', roughness: 0.4, clearcoat: 0.4 },
  },
  finishes: deskFinishes(['body'], ['cup']),
  defaultFinish: 'oak',
  pitch: 22,
  mount: 'desk',
  parts: [
    block('base', 'body', [0.26, BASE, 0.15], {
      at: [0, BASE / 2, 0],
      round: 0.008,
      segments: 3,
      contact: true,
    }),
    block('rear', 'body', [0.26, 0.06, 0.016], {
      at: [0, BASE + 0.03, -0.067],
      round: 0.006,
      segments: 3,
    }),
    block('tray', 'body', [0.09, 0.04, 0.115], {
      at: [0.08, BASE + 0.02, 0.01],
      round: 0.008,
      segments: 3,
    }),
    block('pad', 'accent', [0.075, 0.03, 0.075], {
      at: [0.08, BASE + 0.055, 0.01],
      round: 0.004,
      segments: 3,
    }),
    rod(
      'cupLarge',
      'cup',
      { height: 0.11, top: 0.034, bottom: 0.03, segments: 40 },
      {
        at: [-0.085, BASE + 0.055, 0.005],
      },
    ),
    rod(
      'cupSmall',
      'cup',
      { height: 0.085, top: 0.028, bottom: 0.025, segments: 40 },
      {
        at: [-0.01, BASE + 0.0425, 0.005],
      },
    ),
    rod(
      'penA',
      'accent',
      { height: 0.1, top: 0.0045, segments: 16 },
      {
        at: [-0.09, BASE + 0.145, 0.005],
        turn: [6, 0, -5],
        minLod: 1,
      },
    ),
    rod(
      'penB',
      'accent',
      { height: 0.1, top: 0.0045, segments: 16 },
      {
        at: [-0.078, BASE + 0.14, 0.012],
        turn: [-4, 0, 7],
        minLod: 1,
      },
    ),
    rod(
      'ruler',
      'cup',
      { height: 0.14, top: 0.0045, segments: 16 },
      {
        at: [-0.01, BASE + 0.12, 0.005],
        turn: [0, 0, 5],
        minLod: 1,
      },
    ),
  ],
});
