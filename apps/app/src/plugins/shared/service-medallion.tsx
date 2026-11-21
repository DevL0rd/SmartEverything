import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';
import { Arc } from '../../components/charts';
import { Glow } from '../../components/glow';
import { Icon, type IconName } from '../../components/icon';
import { STATUS_FILL } from '../../components/tone';
import { cn } from '../../design/cn';
import { useIdiom } from '../../design/platform';
import type { ColourRole } from '../../design/tokens';
import {
  medallionGeometry,
  ringValue,
  type MedallionGeometry,
  type MedallionSize,
  type MedallionTone,
} from './medallion-model';

const GLOW_STRENGTH = { light: 0.35, dark: 0.5 } as const;

export interface ServiceMedallionProps {
  readonly glyph: IconName;
  readonly tone: MedallionTone;
  readonly ratio: number | null;
  readonly live: boolean;
  readonly size: MedallionSize;
  readonly label: string;
  readonly offline?: boolean;
  readonly ticking: boolean;
}

function toneRole(tone: MedallionTone): ColourRole {
  return tone === 'neutral' ? 'on-surface-faint' : tone;
}

function Disc({
  geometry,
  glyph,
  offline,
}: {
  readonly geometry: MedallionGeometry;
  readonly glyph: IconName;
  readonly offline: boolean;
}): ReactNode {
  return (
    <View
      aria-hidden
      style={geometry.discStyle}
      className={cn(
        'absolute items-center justify-center rounded-full border-hairline border-outline-variant bg-surface-1 elevation-1',
        offline && 'opacity-60',
      )}
    >
      <Icon name={glyph} size={geometry.glyph} colour="primary" />
    </View>
  );
}

function StatusMark({
  geometry,
  tone,
}: {
  readonly geometry: MedallionGeometry;
  readonly tone: MedallionTone;
}): ReactNode {
  return (
    <View
      aria-hidden
      style={geometry.dotStyle}
      className={cn(
        'absolute rounded-full border-2 border-surface-1',
        tone === 'neutral' ? 'bg-on-surface-faint' : STATUS_FILL[tone],
      )}
    />
  );
}

export function ServiceMedallion({
  glyph,
  tone,
  ratio,
  live,
  size,
  label,
  offline = false,
  ticking,
}: ServiceMedallionProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const theme = useUniwind().theme;
  const geometry = medallionGeometry(size, pointer);
  const shown: MedallionTone = offline ? 'neutral' : tone;
  const strength = GLOW_STRENGTH[theme === 'light' ? 'light' : 'dark'];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={geometry.boxStyle}
      className="shrink-0"
    >
      {shown === 'neutral' ? null : (
        <View pointerEvents="none" style={geometry.glowStyle} className="absolute">
          <Glow colour={toneRole(shown)} strength={strength} breathing={live} />
        </View>
      )}
      <Disc geometry={geometry} glyph={glyph} offline={offline} />
      <View aria-hidden className="absolute inset-0">
        <Arc
          value={ringValue(ratio, offline)}
          size={geometry.px}
          thickness={geometry.thickness}
          colour={toneRole(shown)}
          trackColour="outline-variant"
          ticking={ticking}
        />
      </View>
      <StatusMark geometry={geometry} tone={shown} />
    </View>
  );
}
