import type { BrushBrand } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ToothbrushVisual } from '../../../features/device-visuals/visuals/toothbrush-visual';
import type { ToothbrushFacts, VisualState } from '../../../features/device-visuals/types';
import { boxStyle } from '../charts/style';

const BASE: VisualState = {
  power: 'on',
  online: true,
  level: 0,
  band: null,
  target: null,
  targetShare: null,
  current: null,
  oscillating: false,
  angle: null,
  colour: null,
  ambientLight: null,
  waterLow: false,
  waterLevel: null,
  thermal: 'idle',
  locked: null,
  position: null,
  progress: null,
  battery: null,
  pulse: null,
  syncing: false,
  load: null,
  reading: null,
  source: null,
  presence: null,
  open: null,
};

function factsOf(brand: BrushBrand, ring: string | null): ToothbrushFacts {
  return {
    brand,
    activity: 'standby',
    link: 'linked',
    mode: null,
    intensity: null,
    pressure: null,
    head: 'fitted',
    headType: null,
    wear: null,
    battery: 80,
    fault: false,
    ring,
    face: null,
    sector: null,
    daysLeftRatio: null,
    elapsedS: null,
    display: true,
    handle: null,
  };
}

export function StaticBrush({
  brand,
  px,
  ring = null,
}: {
  readonly brand: BrushBrand;
  readonly px: number;
  readonly ring?: string | null;
}): ReactNode {
  return (
    <View aria-hidden className="items-center justify-center" style={boxStyle(px, px)}>
      <ToothbrushVisual
        state={{ ...BASE, toothbrush: factsOf(brand, ring) }}
        size="hero"
        px={px}
        tone="active"
        moving={false}
        reduced
      />
    </View>
  );
}
