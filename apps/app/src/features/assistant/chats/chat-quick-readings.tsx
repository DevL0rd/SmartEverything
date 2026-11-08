import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { CacheIndicator } from '../components/cache-indicator';
import { BOTTOM_READING_ID, type BottomReading } from '../components/bottom-status-model';
import { ContextRing } from '../components/context-ring';
import { cacheLabel } from '../model/chat-footer';

function ContextMark({ percent }: { readonly percent: number | null }): ReactNode {
  return (
    <View aria-hidden pointerEvents="none" className="flex-row items-center gap-1.5 px-1">
      {percent === null ? (
        <Icon name="gauge" size={16} tone="variant" />
      ) : (
        <ContextRing percent={percent} size={16} />
      )}
      <Text variant="footnote" tone="variant" className="tabular">
        {percent === null ? '—' : `${String(percent)}%`}
      </Text>
    </View>
  );
}

export interface QuickBilling {
  readonly text: string;
  readonly label: string;
}

export interface StripReadings {
  readonly contextLabel: string;
  readonly percent: number | null;
  readonly cache: number | null;
  readonly billing: QuickBilling | null;
}

function ReadingWell({
  target,
  label,
  expanded,
  selected,
  onPress,
  children,
}: {
  readonly target: BottomReading;
  readonly label: string;
  readonly expanded: boolean;
  readonly selected: BottomReading | null;
  readonly onPress: (reading: BottomReading) => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Interactive
      label={label}
      expanded={expanded}
      selected={selected === target}
      controls={BOTTOM_READING_ID[target]}
      onPress={(): void => {
        onPress(target);
      }}
      className="min-h-touch-min min-w-touch-min flex-row items-center justify-center gap-1.5 rounded-sm px-1.5"
      layerClassName="rounded-sm"
    >
      <View aria-hidden pointerEvents="none" className="flex-row items-center gap-1.5">
        {children}
      </View>
    </Interactive>
  );
}

export function ReadingWells({
  readings,
  ...well
}: {
  readonly readings: StripReadings;
  readonly expanded: boolean;
  readonly selected: BottomReading | null;
  readonly onPress: (reading: BottomReading) => void;
}): ReactNode {
  const { contextLabel, percent, cache, billing } = readings;
  const context = percent === null ? 'Context unavailable' : `${contextLabel} ${String(percent)}%`;
  const label = joinParts([context, cacheLabel(cache) ?? 'Cache unavailable']);
  return (
    <>
      <ReadingWell {...well} target="context" label={label}>
        <ContextMark percent={percent} />
        <CacheIndicator percent={cache ?? 0} size={16} />
      </ReadingWell>
      {billing === null ? null : (
        <ReadingWell {...well} target="billing" label={billing.label}>
          <Text variant="footnote" tone="variant" className="tabular">
            {billing.text}
          </Text>
        </ReadingWell>
      )}
    </>
  );
}
