import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { slide } from '../fc03/frame';
import { STRUCTURE_FINISH_NAMES, WALL_VIEW, anchorsOf, box, by, framingOf } from '../fc01/look';
import {
  GAP,
  WINDOW_MATERIALS,
  WINDOW_STATES,
  openingShot,
  sashParts,
  windowFinishes,
  windowFrame,
  windowMeta,
} from './common';

const BAR = 0.05;
const DEPTH = 0.09;
const SILL = 0.03;
const STILE = 0.04;
const SASH_DEPTH = 0.032;
const LANE = 0.02;
const OVERLAP = 0.04;
const TRAVEL = 0.5;

const PANE_W = by('width', 0.5, -BAR + OVERLAP / 2);
const PANE_H = by('height', 1, -(SILL + 2 * BAR + 2 * GAP));
const MID_Y = by('height', 0.5, SILL / 2);

function panes(): ModelSpecPart[] {
  return [
    ...sashParts({
      name: 'Slide',
      at: [by('width', -0.25, BAR / 2 + OVERLAP / 4), MID_Y, LANE],
      w: PANE_W,
      h: PANE_H,
      depth: SASH_DEPTH,
      stile: STILE,
      meet: 1,
      handle: 'latch',
    }),
    ...sashParts({
      name: 'Fixed',
      at: [by('width', 0.25, -BAR / 2 - OVERLAP / 4), MID_Y, -LANE],
      w: PANE_W,
      h: PANE_H,
      depth: SASH_DEPTH,
      stile: STILE,
      meet: -1,
    }),
  ];
}

function tracks(): ModelSpecPart[] {
  return ([1, -1] as const).map((lane) =>
    box(
      lane > 0 ? 'trackFront' : 'trackBack',
      'frame',
      { w: by('width', 1, -2 * BAR), h: 0.012, d: 0.012, r: 0.003 },
      { at: [0, SILL + BAR + 0.006, lane * LANE], minLod: 1 },
    ),
  );
}

export const WINDOW_SLIDING_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.window-sliding',
  version: '1.0.0',
  title: 'Sliding window',
  category: 'structure',
  footprint: { width: 1.58, depth: 0.13, height: 1 },
  size: {
    width: { param: 'width', extra: 0.08, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  framing: framingOf(WALL_VIEW),
  shots: [openingShot('glassSlide', { zoom: 1.1, yaw: -12, pitch: 4 })],
  meta: windowMeta(
    'Sliding window',
    ['sliding window', 'slider window', 'horizontal sliding window', 'glider window', 'window'],
    'large',
    STRUCTURE_FINISH_NAMES,
  ),
  params: {
    width: { min: 1.2, max: 2, default: 1.5, unit: 'm' },
    height: { min: 0.6, max: 1.5, default: 1, unit: 'm' },
  },
  materials: WINDOW_MATERIALS,
  ...windowFinishes(),
  parts: [...windowFrame({ bar: BAR, depth: DEPTH, sill: SILL }), ...tracks(), ...panes()],
  anchors: anchorsOf({
    id: 'slidingWindow',
    mount: 'wall',
    size: [1.58, 1, 0.13],
    centreY: 0.5,
  }),
  channels: [slide('paneSlide', 'glassSlide', TRAVEL)],
  states: WINDOW_STATES,
};
