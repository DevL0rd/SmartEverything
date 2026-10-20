import type { BrushProfile } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import { boxStyle } from './style';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { mouthZones, type MouthZone } from '../model/mouth-model';

export type ZoneState = 'done' | 'current' | 'todo' | 'missed' | 'rest';

const STATE_COLOUR: Readonly<Record<ZoneState, ColourRole>> = {
  done: 'positive',
  current: 'primary',
  todo: 'surface-3',
  missed: 'warning',
  rest: 'surface-3',
};

const STATE_OPACITY: Readonly<Record<ZoneState, number>> = {
  done: 0.85,
  current: 1,
  todo: 1,
  missed: 0.9,
  rest: 0.7,
};

function Hatch({
  id,
  colour,
  edge,
}: {
  readonly id: string;
  readonly colour: string;
  readonly edge: string;
}): ReactNode {
  return (
    <Defs>
      <Pattern
        id={id}
        width={6}
        height={6}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <Rect width={6} height={6} fill={edge} />
        <Rect width={3} height={6} fill={colour} />
      </Pattern>
    </Defs>
  );
}

function ZoneShape({
  zone,
  state,
  hatch,
}: {
  readonly zone: MouthZone;
  readonly state: ZoneState;
  readonly hatch: string;
}): ReactNode {
  const fill = useColour(STATE_COLOUR[state]);
  const edge = useColour('outline');
  return (
    <>
      <Path
        d={zone.path}
        fill={state === 'missed' ? `url(#${hatch})` : fill}
        fillOpacity={STATE_OPACITY[state]}
        stroke={edge}
        strokeWidth={1}
      />
    </>
  );
}

function Outline({ size }: { readonly size: number }): ReactNode {
  const track = useColour('surface-2');
  const ink = useColour('on-surface');
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={size * 0.42}
        fill={track}
        stroke={ink}
        strokeOpacity={0.2}
      />
      <Path
        d={`M${String(size * 0.32)} ${String(size * 0.5)}h${String(size * 0.36)}`}
        stroke={ink}
        strokeOpacity={0.5}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ZoneNumbers({ zones }: { readonly zones: readonly MouthZone[] }): ReactNode {
  const ink = useColour('on-surface');
  return zones.map((zone) => (
    <G key={zone.zone} transform={`translate(${String(zone.label.x)} ${String(zone.label.y + 4)})`}>
      <SvgText fontSize={11} fill={ink} textAnchor="middle">
        {String(zone.zone)}
      </SvgText>
    </G>
  ));
}

export function MouthMap({
  profile,
  states,
  size,
  label,
  numbers = false,
}: {
  readonly profile: BrushProfile;
  readonly states: ReadonlyMap<number, ZoneState>;
  readonly size: number;
  readonly label: string;
  readonly numbers?: boolean;
}): ReactNode {
  const zones = mouthZones(profile.zones, size);
  const warning = useColour('warning');
  const track = useColour('surface-2');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={boxStyle(size, size)}
      className="items-center justify-center"
    >
      {zones.length === 0 ? (
        <Outline size={size} />
      ) : (
        <Svg width={size} height={size}>
          <Hatch id="hatch" colour={warning} edge={track} />
          <G>
            {zones.map((zone) => (
              <ZoneShape
                key={zone.zone}
                zone={zone}
                state={states.get(zone.zone) ?? 'rest'}
                hatch="hatch"
              />
            ))}
          </G>
          {numbers ? <ZoneNumbers zones={zones} /> : null}
        </Svg>
      )}
    </View>
  );
}
