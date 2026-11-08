import type { ModelSpec } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { disc, look, OK, SCREEN } from './kit';

const HOUSE = { yaw: 24, pitch: 10, fov: 28, padding: 0.1, focus: 'screen' } as const;
const W = 0.6;
const H = 0.4;
const T = 0.016;
const CHIN = 0.05;
const BASE_D = 0.2;
const BASE_H = 0.012;
const NECK_H = 0.2;
const PANEL_Y = BASE_H + NECK_H + H / 2 - 0.05;
const PANEL_Z = 0.03;
const SCREEN_H = H - CHIN - 0.014;

export const ALL_IN_ONE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.computer.all-in-one',
  version: '1.0.0',
  title: 'All-in-one PC',
  category: 'computer',
  family: 'computer',
  footprint: { width: W, depth: BASE_D, height: PANEL_Y + H / 2 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.12, pitch: 12 },
  },
  shots: [
    {
      id: 'screen',
      when: { anyOf: [{ allOf: [{ signal: 'screenOn', op: 'eq', value: true }] }] },
      focus: 'screen',
      zoom: 1.2,
      yaw: 16,
      pitch: 8,
      easeMs: 900,
      loopS: 3,
      symmetry: 360,
      stillAt: 1.5,
    },
  ],
  meta: {
    names: {
      display: 'All-in-one PC',
      synonyms: ['aio', 'desktop all in one', 'imac style computer', 'integrated desktop'],
    },
    sizeClass: 'medium',
    variants: ['silver', 'graphite'],
  },
  materials: {
    body: { finish: 'brushed-aluminium' },
    panel: { finish: 'satin-black', roughness: 0.08, clearcoat: 1 },
    trim: { finish: 'rubber' },
    accent: { color: OK, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    silver: {},
    graphite: { body: { finish: 'graphite' } },
  },
  defaultFinish: 'silver',
  parts: [
    box('base', [0.22, BASE_H, BASE_D, 0.005], 'body', { at: [0, BASE_H / 2, 0], contact: true }),
    box('neck', [0.07, NECK_H, 0.02, 0.008], 'body', {
      at: [0, BASE_H + NECK_H / 2 - 0.004, -0.03],
      transform: { rotation: [-6, 0, 0] },
    }),
    box('body', [W, H, T, 0.01], 'body', { at: [0, PANEL_Y, PANEL_Z] }),
    box('back', [0.42, H - 0.1, 0.026, 0.014], 'body', {
      at: [0, 0.02, -0.018],
      parent: 'body',
      minLod: 1,
    }),
    box('glass', [W - 0.014, H - 0.014, 0.0016, 0.006], 'panel', {
      at: [0, 0, T / 2],
      parent: 'body',
    }),
    {
      id: 'screen',
      parent: 'body',
      geometry: {
        type: 'roundedPlane',
        width: W - 0.03,
        height: SCREEN_H,
        radius: 0.003,
        segments: 4,
      },
      material: 'panel',
      transform: { position: [0, (H - SCREEN_H) / 2 - 0.007, T / 2 + 0.0012] },
    },
    disc('camera', [0.0022, 0.0016, 0.0006], 'trim', {
      at: [0, H / 2 - 0.0105, T / 2 + 0.0012],
      parent: 'body',
      minLod: 1,
    }),
    {
      id: 'chinLed',
      parent: 'body',
      geometry: { type: 'roundedPlane', width: 0.012, height: 0.0016, radius: 0.0008, segments: 4 },
      material: 'accent',
      transform: { position: [0, -H / 2 + 0.022, T / 2 + 0.0012] },
      minLod: 1,
    },
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'body',
      position: [0, (H - SCREEN_H) / 2 - 0.007, T / 2 + 0.0014],
      width: W - 0.03,
      height: SCREEN_H,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, PANEL_Y + H / 2 + 0.04, 0] },
    {
      kind: 'hit',
      id: 'bodyHit',
      position: [0, (PANEL_Y + H / 2) / 2, 0],
      size: [W, PANEL_Y + H / 2, BASE_D],
    },
  ],
  channels: [
    look('screenTint', ['screen', 'colour'], ['screenOn', { true: SCREEN }]),
    look('screenLit', ['screen', 'emissive'], ['screenOn', { true: 0.9, false: 0 }], {
      type: 'pose',
      easeMs: 300,
    }),
    look('screenOff', ['screen', 'emissive'], ['power', { false: 0 }], {
      type: 'pose',
      easeMs: 450,
    }),
    look('ledShow', ['chinLed', 'opacity'], ['power', { true: 1, false: 0 }]),
    look('ledGlow', ['chinLed', 'emissive'], ['power', { true: 1, false: 0 }]),
  ],
  states: {
    off: { power: false, online: true, screenOn: false },
    sleep: { power: true, online: true, screenOn: false },
    on: { power: true, online: true, screenOn: true },
    offline: { online: false },
  },
};
