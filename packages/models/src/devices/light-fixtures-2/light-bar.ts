import type { ModelSpec } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import { emitter, glowChannels, glowShot, lightModel, spillChannels } from '../light-fixtures/kit';

const BAR_W = 0.038;
const BAR_H = 0.25;
const BAR_D = 0.032;
const FOOT_H = 0.012;
const BAR_Y = FOOT_H + 0.006 + BAR_H / 2;
const VIEW = { yaw: 30, pitch: 14, fov: 28, padding: 0.08, focus: 'bar' } as const;

const PARTS: ModelSpec['parts'] = [
  box('foot', [0.078, FOOT_H, 0.064, 0.0024], 'body', {
    at: [0, FOOT_H / 2, 0],
    segments: 5,
    contact: true,
  }),
  part(
    'button',
    { type: 'ring', innerRadius: 0.0018, outerRadius: 0.0034, segments: 32 },
    'accent',
    {
      transform: { position: [0.024, FOOT_H + 0.0004, 0.018], rotation: [-90, 0, 0] },
      minLod: 2,
    },
  ),
  box('neck', [0.022, 0.012, 0.016, 0.0024], 'trim', {
    at: [0, FOOT_H + 0.005, 0],
  }),
  box('bar', [BAR_W, BAR_H, BAR_D, 0.0064], 'body', {
    at: [0, BAR_Y, 0],
    segments: 5,
    transform: { rotation: [-4, 0, 0] },
  }),
  part(
    'lens',
    {
      type: 'roundedPlane',
      width: BAR_W - 0.008,
      height: BAR_H - 0.012,
      radius: 0.012,
      segments: 6,
    },
    'glass',
    {
      parent: 'bar',
      transform: { position: [0, 0, BAR_D / 2 + 0.0006] },
    },
  ),
  part(
    'bezel',
    {
      type: 'roundedPlane',
      width: BAR_W - 0.004,
      height: BAR_H - 0.006,
      radius: 0.014,
      segments: 6,
    },
    'trim',
    {
      parent: 'bar',
      transform: { position: [0, 0, BAR_D / 2 + 0.0003] },
      minLod: 1,
    },
  ),
  part(
    'backLens',
    { type: 'roundedPlane', width: BAR_W - 0.01, height: BAR_H - 0.03, radius: 0.01, segments: 6 },
    'glass',
    {
      parent: 'bar',
      transform: { position: [0, 0, -BAR_D / 2 - 0.0006], rotation: [0, 180, 0] },
      minLod: 1,
    },
  ),
  part('halo', { type: 'glow', width: 0.2, height: 0.38, segments: 32 }, 'glass', {
    parent: 'bar',
    transform: { position: [0, 0.02, -BAR_D / 2 - 0.05] },
    minLod: 1,
  }),
];

export const LIGHT_BAR_MODEL: ModelSpec = lightModel({
  id: 'dev.light.light-bar',
  title: 'Light bar',
  footprint: { width: 0.078, depth: 0.064, height: BAR_Y + BAR_H / 2 + 0.004 },
  framing: { tile: VIEW, card: VIEW, hero: { ...VIEW, padding: 0.1 } },
  shots: [glowShot({ focus: 'bar', zoom: 1.15, yaw: 26, pitch: 10 })],
  meta: {
    names: {
      display: 'Light bar',
      synonyms: ['light bar', 'play bar', 'TV backlight', 'ambient bar', 'gradient bar'],
    },
    sizeClass: 'small',
    variants: ['black', 'white'],
  },
  materials: {
    body: { finish: 'satin-black' },
    trim: { finish: 'graphite' },
    glass: { finish: 'frosted-glass', opacity: 0.94 },
    accent: { finish: 'chrome' },
  },
  ...finishSet(
    {
      black: {},
      white: { body: { finish: 'matte-white' }, trim: { finish: 'warm-white' } },
    },
    'black',
  ),
  parts: PARTS,
  anchors: [
    emitter({
      id: 'light',
      parent: 'bar',
      position: [0, 0, -BAR_D / 2 - 0.02],
      radius: 1.8,
      cone: 120,
    }),
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, BAR_Y + BAR_H / 2 + 0.03, 0] },
    { kind: 'hit', id: 'hitBar', position: [0, BAR_Y, 0], size: [0.078, BAR_H + 0.02, 0.064] },
  ],
  channels: [
    ...glowChannels('lens', [0.05, 1.7]),
    ...glowChannels('backLens', [0.05, 1.7]),
    ...spillChannels('halo', [0.3, 0.85]),
    ...glowChannels('light', [0.35, 1]),
  ],
});
