import type { ReactNode } from 'react';
import { View } from 'react-native';
import { formatByteRate, type ComputerParts } from '@smarteverything/domain';
import { LiveFigure } from '../../../components/live-figure';
import { Text } from '../../../components/text';
import { useComputerSelect } from '../data/computer-metrics';
import { spokenFact } from '../model/spoken-unit';

export function RateFact({
  deviceId,
  label,
  read,
  stale,
}: {
  readonly deviceId: string;
  readonly label: string;
  readonly read: (parts: ComputerParts) => number | null;
  readonly stale: boolean;
}): ReactNode {
  const text = useComputerSelect(deviceId, (parts) => {
    const rate = read(parts);
    return rate === null ? null : formatByteRate(rate);
  });
  if (text === null) return null;
  const [value = '0', unit = 'B/s'] = text.split(' ');
  return (
    <View accessible accessibilityLabel={spokenFact(label, value, unit)} className="min-w-0">
      <View aria-hidden>
        <Text variant="caption" tone="variant">
          {label}
        </Text>
        <LiveFigure value={value} unit={unit} size="m" widest="888" stale={stale} />
      </View>
    </View>
  );
}
