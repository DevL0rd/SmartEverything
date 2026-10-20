import type { BrushLiveFrame, BrushStateView } from '@smarteverything/domain';
import type { ToothbrushFacts, VisualState } from '../../../features/device-visuals/types';
import { isBrushingNow } from './brush-model';
import { daysLeftRatio } from './care-model';

const FULL = 100;

function ringHex(view: BrushStateView): string | null {
  const levels = view.handle.oralb?.ringDisplay ?? null;
  return levels === null
    ? null
    : `#${levels.map((level) => level.toString(16).padStart(2, '0')).join('')}`;
}

function brushFacts(frame: BrushLiveFrame, view: BrushStateView): ToothbrushFacts {
  const { head, battery } = view;
  return {
    brand: view.profile.brand,
    activity: frame.activity,
    link: frame.link,
    mode: frame.mode,
    intensity: frame.intensity,
    pressure: frame.pressure,
    head: head.state,
    headType: head.type,
    wear: head.wearPercent === null ? null : Math.min(1, head.wearPercent / FULL),
    battery: frame.battery ?? battery.percent,
    fault: view.handle.faultHex !== null,
    ring: ringHex(view),
    face: frame.face,
    sector: frame.zone,
    daysLeftRatio: daysLeftRatio(head),
    elapsedS: frame.elapsedS,
    display: view.profile.brand !== 'oralb' || view.profile.face === 'display',
    handle: null,
  };
}

export function brushVisualState(
  base: VisualState,
  frame: BrushLiveFrame,
  view: BrushStateView,
): VisualState {
  const awake = isBrushingNow(frame.activity) || frame.activity === 'standby';
  return { ...base, power: awake ? 'on' : 'off', toothbrush: brushFacts(frame, view) };
}
