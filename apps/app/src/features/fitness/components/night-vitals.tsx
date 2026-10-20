import type { ReactNode } from 'react';
import { View } from 'react-native';
import { NightTrace } from '../../../components/charts/night-trace';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import { useRecords } from '../data/queries';
import { vitalsQueryWindowOf } from '../model/night-card';
import { NIGHT_VITAL_TYPES, vitalsOf, type NightVital } from '../model/night-vitals';
import type { SleepNight } from '../model/sleep';

interface Shared {
  readonly night: SleepNight;
  readonly at: number | null;
  readonly onAt: (at: number | null) => void;
}

function Header({ vital }: { readonly vital: NightVital }): ReactNode {
  const { split } = useSizeClass();
  return (
    <View className={cn('gap-0.5', split && 'flex-row items-baseline justify-between gap-3')}>
      <Text variant="footnote" numberOfLines={1} className="shrink">
        <Text variant="label">{vital.title}</Text>
        <Text variant="footnote" tone="variant">{` · ${vital.summary}`}</Text>
      </Text>
      {vital.note === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
          {vital.note}
        </Text>
      )}
    </View>
  );
}

function Vital({ vital, night, at, onAt }: Shared & { readonly vital: NightVital }): ReactNode {
  return (
    <View className="gap-1.5">
      <Header vital={vital} />
      <NightTrace
        points={vital.points}
        label={vital.title}
        unit={vital.unit}
        from={night.bedtime}
        to={night.wake}
        at={at}
        onAt={onAt}
        {...(vital.domain === undefined ? {} : { domain: vital.domain })}
        {...(vital.guide === undefined ? {} : { guide: vital.guide })}
        {...(vital.lowMark === true ? { lowMark: true } : {})}
        {...(vital.ringBelow === undefined ? {} : { ringBelow: vital.ringBelow })}
        {...(vital.dots === true ? { dots: true } : {})}
      />
    </View>
  );
}

export function NightVitals({ night, at, onAt }: Shared): ReactNode {
  const window = vitalsQueryWindowOf(night);
  const records = useRecords(NIGHT_VITAL_TYPES, window.from, window.to);
  const vitals = vitalsOf(records.data ?? [], night);
  if (vitals.length === 0) {
    return null;
  }
  return (
    <View className="gap-4">
      {vitals.map((vital) => (
        <Vital key={vital.key} vital={vital} night={night} at={at} onAt={onAt} />
      ))}
    </View>
  );
}
