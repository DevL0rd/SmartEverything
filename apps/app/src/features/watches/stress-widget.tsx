import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { WidgetSize } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { FillChart } from '../../components/charts';
import { Figure } from '../../components/figure';
import { Text } from '../../components/text';
import { WidgetFrame, type WidgetDefinition } from '../../components/widget-board';
import { errorText } from '../../format/errors';
import { joinParts } from '../../format/text';
import { stressLevel, useWatchToday, type WatchDay } from './watch-days';
import { useMyWatch } from './watch-glance';

function StressChart({ stress }: { readonly stress: WatchDay }): ReactNode {
  return (
    <FillChart
      values={stress.points.map((point) => ({ key: String(point.t), value: point.v }))}
      kind="line"
      colour="viz-3"
      reference={stress.average}
      band={{ min: 0, max: 25 }}
      label="Stress today"
    />
  );
}

function StressBody({
  stress,
  size,
}: {
  readonly stress: WatchDay;
  readonly size: WidgetSize;
}): ReactNode {
  if (stress.latest === null || stress.average === null || stress.maximum === null) {
    return (
      <Text variant="callout" tone="variant">
        No stress readings today yet.
      </Text>
    );
  }
  const headline = (
    <View className="gap-0.5">
      <Figure
        value={String(stress.latest)}
        unit={stressLevel(stress.latest)}
        size={size === 'S' ? 'm' : 'l'}
      />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {joinParts([`Average ${String(stress.average)}`, `Peak ${String(stress.maximum)}`])}
      </Text>
    </View>
  );
  if (size === 'S') {
    return (
      <View className="flex-1 gap-2">
        {headline}
        <StressChart stress={stress} />
      </View>
    );
  }
  return (
    <View className="flex-1 flex-row gap-4">
      <View className="w-36 justify-center">{headline}</View>
      <StressChart stress={stress} />
    </View>
  );
}

function StressContent({ size }: { readonly size: WidgetSize }): ReactNode {
  const today = useWatchToday();
  if (today.kind === 'loading') {
    return null;
  }
  if (today.kind === 'failed') {
    return (
      <Text variant="callout" tone="critical">
        {errorText(today.error).title}
      </Text>
    );
  }
  return <StressBody stress={today.stress} size={size} />;
}

function StressWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const watch = useMyWatch();
  return (
    <WidgetFrame
      title="Stress"
      icon="brain"
      accent="viz-3"
      href={watch === null ? href.connect('watch') : href.device(watch)}
      size={size}
    >
      <StressContent size={size} />
    </WidgetFrame>
  );
}

const SIZES = ['S', 'M', 'W'] as const;

export const STRESS_WIDGET: WidgetDefinition = {
  type: 'stress',
  title: 'Stress',
  icon: 'heartPulse',
  sizes: { compact: SIZES, medium: SIZES, expanded: SIZES },
  defaultSize: 'M',
  render: ({ size }) => <StressWidget size={size} />,
};
