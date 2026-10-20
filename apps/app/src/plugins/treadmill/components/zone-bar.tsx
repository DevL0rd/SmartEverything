import type { SessionZoneSeconds } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SPEED_ZONES } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { ZONES, type ZoneKey } from '../../../features/fitness/model/heart';
import { cn } from '../../../design/cn';
import { minutesText } from '../model/stats-model';
import { ZONE_DOT, ZONE_LABEL } from '../model/treadmill-model';

function growOf(seconds: number): { readonly flexGrow: number } {
  return { flexGrow: Math.max(seconds, 0) };
}

function zoneSentence(zones: SessionZoneSeconds): string {
  return SPEED_ZONES.map((zone) => `${ZONE_LABEL[zone]} ${minutesText(zones[zone])}`).join(', ');
}

export function ZoneStrip({ zones }: { readonly zones: SessionZoneSeconds }): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Time in each speed zone: ${zoneSentence(zones)}`}
      className="h-3 flex-row gap-0.5 overflow-hidden rounded-full bg-surface-3"
    >
      {SPEED_ZONES.map((zone) =>
        zones[zone] > 0 ? (
          <View
            key={zone}
            style={growOf(zones[zone])}
            className={cn('h-full basis-0', ZONE_DOT[zone])}
          />
        ) : null,
      )}
    </View>
  );
}

export function ZoneBar({ zones }: { readonly zones: SessionZoneSeconds }): ReactNode {
  const total = SPEED_ZONES.reduce((sum, zone) => sum + zones[zone], 0);
  return (
    <View className="gap-2">
      <ZoneStrip zones={zones} />
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {SPEED_ZONES.map((zone) => (
          <View key={zone} className="flex-row items-center gap-1.5">
            <View className={cn('size-2 rounded-full', ZONE_DOT[zone])} />
            <Text variant="caption" tone="variant" className="tabular">
              {ZONE_LABEL[zone]} {total === 0 ? '0 min' : minutesText(zones[zone])}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const HEART_DOT: Readonly<Record<ZoneKey, string>> = {
  warm: 'bg-viz-6',
  easy: 'bg-viz-1',
  aerobic: 'bg-viz-5',
  hard: 'bg-viz-2',
  peak: 'bg-critical',
};

function heartSentence(seconds: Readonly<Record<ZoneKey, number>>, target: ZoneKey | null): string {
  const parts = ZONES.map((zone) => `${zone.label} ${minutesText(seconds[zone.key])}`).join(', ');
  const aim =
    target === null ? '' : `, target ${ZONES.find((zone) => zone.key === target)?.label ?? ''}`;
  return `Time in each heart rate zone: ${parts}${aim}`;
}

export function HeartZoneBar({
  seconds,
  target,
}: {
  readonly seconds: Readonly<Record<ZoneKey, number>>;
  readonly target: ZoneKey | null;
}): ReactNode {
  return (
    <View className="gap-2">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={heartSentence(seconds, target)}
        className="h-3 flex-row gap-0.5 overflow-hidden rounded-full bg-surface-3"
      >
        {ZONES.map((zone) =>
          seconds[zone.key] > 0 ? (
            <View
              key={zone.key}
              style={growOf(seconds[zone.key])}
              className={cn('h-full basis-0', HEART_DOT[zone.key])}
            />
          ) : null,
        )}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {ZONES.map((zone) => (
          <View key={zone.key} className="flex-row items-center gap-1.5">
            <View className={cn('size-2 rounded-full', HEART_DOT[zone.key])} />
            <Text
              variant="caption"
              tone={zone.key === target ? 'default' : 'variant'}
              className="tabular"
            >
              {zone.label} {minutesText(seconds[zone.key])}
              {zone.key === target ? ', target' : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
