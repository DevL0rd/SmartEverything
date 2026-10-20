import type { InclineScale } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { inclineRows } from '../model/profile-model';

const MIN_SHARE = 0.02;

function fillStyle(share: number): { readonly flexGrow: number } {
  return { flexGrow: Math.max(share, MIN_SHARE) };
}

function restStyle(share: number): { readonly flexGrow: number } {
  return { flexGrow: Math.max(1 - share, 0) };
}

export function TimeAtIncline({
  seconds,
  scale,
}: {
  readonly seconds: Readonly<Record<string, number>>;
  readonly scale: InclineScale;
}): ReactNode {
  const rows = inclineRows(seconds, scale);
  if (rows.length === 0) {
    return null;
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Time at each incline: ${rows.map((row) => `${row.label} ${row.minutes}`).join(', ')}`}
      className="gap-2"
    >
      {rows.map((row) => (
        <View key={row.key} className="flex-row items-center gap-3">
          <Text variant="caption" tone="variant" className="w-16 tabular">
            {row.label}
          </Text>
          <View className="h-3 min-w-0 flex-1 flex-row overflow-hidden rounded-full bg-surface-3">
            <View
              style={fillStyle(row.share)}
              className="h-full basis-0 rounded-full bg-viz-violet"
            />
            <View style={restStyle(row.share)} className="h-full basis-0" />
          </View>
          <Text variant="caption" tone="variant" className="w-14 text-right tabular">
            {row.minutes}
          </Text>
        </View>
      ))}
    </View>
  );
}
