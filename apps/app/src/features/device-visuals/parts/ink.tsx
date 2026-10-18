import type { AirBand } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { useColour, useColourResolver } from '../../../design/colour';
import { AIR_BAND_COLOUR } from '../../../design/data-colours';
import type { ColourRole } from '../../../design/tokens';
import type { LaundryGlow, VisualTone } from '../types';

export interface VisualInk {
  readonly light: string;
  readonly dark: string;
  readonly edge: string;
  readonly well: string;
  readonly ink: string;
  readonly faint: string;
  readonly sheen: string;
}

export const WELL = 0.6;

export const FIXED_INK = {
  lcd: '#0B0D10',
  lamp: '#FFD27A',
  white: '#FFFFFF',
  foam: 'rgba(255, 255, 255, 0.85)',
  droplet: '#E3F4FF',
} as const;

export const DISPLAY_INK: Readonly<Record<LaundryGlow, string>> = {
  rest: '#A9A49C',
  wash: '#5ED3CF',
  rinse: '#5EA8D3',
  spin: '#9085E9',
  dry: '#F2B45E',
  delay: '#8EAEFF',
  paused: '#F2C14E',
  done: '#6FD39A',
  fault: '#FF6B57',
};

export function useInk(): VisualInk {
  const colour = useColourResolver();
  return {
    light: colour('surface-3'),
    dark: colour('surface-2'),
    edge: colour('outline'),
    well: colour('scrim'),
    ink: colour('on-surface-variant'),
    faint: colour('on-surface-faint'),
    sheen: colour('on-surface'),
  };
}

export function tintRole(role: ColourRole, tone: VisualTone): ColourRole {
  return tone === 'active' ? role : 'on-surface-faint';
}

export function useTint(role: ColourRole, tone: VisualTone): string {
  return useColour(tintRole(role, tone));
}

export function bandRole(band: AirBand | null): ColourRole {
  return band === null ? 'temp-cool' : AIR_BAND_COLOUR[band];
}

export function BodyGradient({
  id,
  ink,
  vertical = false,
}: {
  readonly id: string;
  readonly ink: VisualInk;
  readonly vertical?: boolean;
}): ReactNode {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
      <Stop offset="0" stopColor={ink.dark} />
      <Stop offset="0.45" stopColor={ink.light} />
      <Stop offset="1" stopColor={ink.dark} />
    </LinearGradient>
  );
}

export function GlowGradient({
  id,
  colour,
  strength = 0.55,
}: {
  readonly id: string;
  readonly colour: string;
  readonly strength?: number;
}): ReactNode {
  return (
    <RadialGradient id={id} cx="50%" cy="50%" r="50%">
      <Stop offset="0" stopColor={colour} stopOpacity={strength} />
      <Stop offset="1" stopColor={colour} stopOpacity={0} />
    </RadialGradient>
  );
}
