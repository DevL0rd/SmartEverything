import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { useDeviceDerived } from '../../../store/selectors';
import { sameJson } from '../../../store/same-json';
import { useComputerSelect } from '../data/computer-metrics';
import {
  vitalLines,
  vitalsOfHeadlines,
  vitalsOfSummary,
  type Level,
  type Vitals,
} from '../model/card-vitals';

const LINE_TONE: Readonly<Record<Level, Tone>> = {
  normal: 'variant',
  warm: 'warning',
  hot: 'critical',
};

function Lines({
  vitals,
  stale,
  small,
}: {
  readonly vitals: Vitals | null;
  readonly stale: boolean;
  readonly small: boolean;
}): ReactNode {
  if (vitals === null) return null;
  return (
    <View className="min-w-0">
      {vitalLines(vitals).map((line) => (
        <Text
          key={line.key}
          variant={small ? 'caption' : 'footnote'}
          tone={stale ? 'faint' : LINE_TONE[line.level]}
          numberOfLines={1}
          accessibilityLabel={line.spoken}
          className="tabular"
        >
          {line.text}
        </Text>
      ))}
    </View>
  );
}

function LiveLines({
  deviceId,
  small,
}: {
  readonly deviceId: string;
  readonly small: boolean;
}): ReactNode {
  const vitals = useComputerSelect(deviceId, (parts) => vitalsOfSummary(parts.summary), sameJson);
  return <Lines vitals={vitals} stale={false} small={small} />;
}

function HeldLines({
  deviceId,
  small,
}: {
  readonly deviceId: string;
  readonly small: boolean;
}): ReactNode {
  const vitals = useDeviceDerived(deviceId, vitalsOfHeadlines, [], sameJson);
  return <Lines vitals={vitals} stale small={small} />;
}

export function VitalLines({
  deviceId,
  stale,
  small = false,
}: {
  readonly deviceId: string;
  readonly stale: boolean;
  readonly small?: boolean;
}): ReactNode {
  return stale ? (
    <HeldLines deviceId={deviceId} small={small} />
  ) : (
    <LiveLines deviceId={deviceId} small={small} />
  );
}
