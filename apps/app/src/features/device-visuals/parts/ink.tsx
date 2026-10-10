import type { AirBand } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import type { VisualTone } from '../types';

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

export function useInk(): VisualInk {
  return {
    light: useColour('surface-3'),
    dark: useColour('surface-2'),
    edge: useColour('outline'),
    well: useColour('scrim'),
    ink: useColour('on-surface-variant'),
    faint: useColour('on-surface-faint'),
    sheen: useColour('on-surface'),
  };
}

export function tintRole(role: ColourRole, tone: VisualTone): ColourRole {
  return tone === 'active' ? role : 'on-surface-faint';
}

export function useTint(role: ColourRole, tone: VisualTone): string {
  return useColour(tintRole(role, tone));
}

const BAND_ROLES: Readonly<Record<AirBand, ColourRole>> = {
  good: 'air-good',
  fair: 'air-fair',
  moderate: 'air-moderate',
  poor: 'air-poor',
  bad: 'air-bad',
  severe: 'air-severe',
};

export function bandRole(band: AirBand | null): ColourRole {
  return band === null ? 'temp-cool' : BAND_ROLES[band];
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
