import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { QuietHours } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { windowSegments } from '../model/standing';

const HOUR_MARKS = ['00', '06', '12', '18', '24'] as const;

const DAY_MINUTES = 1440;

const BAR_HEIGHT = 12;

const NOW_WIDTH = 6;

function band(start: number, width: number): string {
  return `M${String(start)} 0h${String(width)}v${String(BAR_HEIGHT)}h${String(-width)}z`;
}

function Track({
  schedule,
  nowShare,
}: {
  readonly schedule: QuietHours | null;
  readonly nowShare: number | null;
}): ReactNode {
  const track = useColour('surface-3');
  const paused = useColour('warning');
  const marker = useColour('on-surface');
  return (
    <Svg
      width="100%"
      height={BAR_HEIGHT}
      viewBox={`0 0 ${String(DAY_MINUTES)} ${String(BAR_HEIGHT)}`}
      preserveAspectRatio="none"
    >
      <Path d={band(0, DAY_MINUTES)} fill={track} />
      {windowSegments(schedule).map((segment) => (
        <Path
          key={segment.start}
          d={band(segment.start * DAY_MINUTES, (segment.end - segment.start) * DAY_MINUTES)}
          fill={paused}
        />
      ))}
      {nowShare === null ? null : (
        <Path d={band(nowShare * DAY_MINUTES - NOW_WIDTH / 2, NOW_WIDTH)} fill={marker} />
      )}
    </Svg>
  );
}

export function DayWindowBar({
  schedule,
  nowShare,
}: {
  readonly schedule: QuietHours | null;
  readonly nowShare: number | null;
}): ReactNode {
  return (
    <View
      className="gap-1"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="overflow-hidden rounded-full">
        <Track schedule={schedule} nowShare={nowShare} />
      </View>
      <View className="flex-row justify-between">
        {HOUR_MARKS.map((mark) => (
          <Text key={mark} variant="caption" tone="faint">
            {mark}
          </Text>
        ))}
      </View>
    </View>
  );
}
