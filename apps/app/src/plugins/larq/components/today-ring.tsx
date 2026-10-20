import type { BottleToday } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Arc } from '../../../components/charts';
import { polar } from '../../../components/charts/arc';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { decimal, millilitres, percent } from '../../../format/number';
import { GOAL_COLOUR, WATER_COLOUR } from '../model/bottle-colours';
import { paceOf, ringProgress, todaySummary } from '../model/bottle-model';
import { shortLitres } from '../model/widget-model';

const SMALL_RING = 140;
const NOTCH_REACH = 3;

interface TodayRingProps {
  readonly today: BottleToday;
  readonly minuteOfDay: number;
  readonly size: number;
  readonly label: boolean;
}

function thicknessOf(size: number): number {
  return Math.max(6, Math.round(size * 0.085));
}

function Notch({
  size,
  thickness,
  share,
}: {
  readonly size: number;
  readonly thickness: number;
  readonly share: number;
}): ReactNode {
  const colour = useColour('on-surface');
  const centre = size / 2;
  const degrees = share * 360;
  const outer = polar(centre, centre - 1, degrees);
  const inner = polar(centre, centre - thickness - NOTCH_REACH, degrees);
  return (
    <View pointerEvents="none" className="absolute" aria-hidden>
      <Svg width={size} height={size}>
        <Path
          d={`M${String(outer.x)} ${String(outer.y)} L${String(inner.x)} ${String(inner.y)}`}
          stroke={colour}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

function Centre({
  today,
  size,
  expectedMl,
}: {
  readonly today: BottleToday;
  readonly size: number;
  readonly expectedMl: number | null;
}): ReactNode {
  const small = size < SMALL_RING;
  return (
    <View className="absolute items-center">
      <Text variant={small ? 'body-strong' : 'title-1'} className="tabular">
        {decimal(Math.round(today.totalMl))}
      </Text>
      <Text variant="caption" tone="variant" className="tabular">
        {`of ${small ? shortLitres(today.goalMl) : millilitres(Math.round(today.goalMl))}`}
      </Text>
      {small ? null : (
        <Text variant="label" tone="info" className="tabular">
          {percent(ringProgress(today))}
        </Text>
      )}
      {expectedMl === null || expectedMl === 0 ? null : (
        <Text variant="caption" tone="faint" className="tabular">
          {`expected ${millilitres(expectedMl)}`}
        </Text>
      )}
    </View>
  );
}

export function TodayRing({ today, minuteOfDay, size, label }: TodayRingProps): ReactNode {
  const pace = paceOf(today, minuteOfDay);
  const share = today.goalMl > 0 ? Math.min(1, pace.expectedMl / today.goalMl) : 0;
  const progress = Math.max(0, ringProgress(today));
  const thickness = thicknessOf(size);
  const colour = progress >= 1 ? GOAL_COLOUR : WATER_COLOUR;
  const frame = { width: size, height: size };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={todaySummary(today, pace)}
      style={frame}
      className="items-center justify-center"
    >
      <Arc value={Math.min(1, progress)} size={size} thickness={thickness} colour={colour} tinted />
      {progress > 1 ? (
        <View pointerEvents="none" className="absolute inset-0 opacity-70">
          <Arc
            value={Math.min(1, progress - 1)}
            size={size}
            thickness={thickness}
            colour={colour}
            trackColour={null}
          />
        </View>
      ) : null}
      {pace.expectedMl > 0 ? <Notch size={size} thickness={thickness} share={share} /> : null}
      <Centre today={today} size={size} expectedMl={label ? pace.expectedMl : null} />
    </View>
  );
}
