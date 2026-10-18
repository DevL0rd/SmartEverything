import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { FillChart } from '../../components/charts';
import { Figure } from '../../components/figure';
import { Text } from '../../components/text';
import { WidgetFrame, type WidgetDefinition } from '../../components/widget-board';
import { allSizes, isTile } from '../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../components/widget-board/use-widget-face';
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
  tile,
}: {
  readonly stress: WatchDay;
  readonly tile: boolean;
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
        size={tile ? 'm' : 'l'}
      />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {joinParts([`Average ${String(stress.average)}`, `Peak ${String(stress.maximum)}`])}
      </Text>
    </View>
  );
  if (tile) {
    return (
      <View className="flex-1 gap-2">
        {headline}
        <StressChart stress={stress} />
      </View>
    );
  }
  return (
    <View className="flex-1 flex-row gap-4">
      <View className="w-1/2 max-w-56 justify-center">{headline}</View>
      <StressChart stress={stress} />
    </View>
  );
}

function StressContent(): ReactNode {
  const today = useWatchToday();
  const tile = isTile(useWidgetFace().cls);
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
  return <StressBody stress={today.stress} tile={tile} />;
}

function StressWidget(): ReactNode {
  const watch = useMyWatch();
  return (
    <WidgetFrame
      title="Stress"
      icon="brain"
      accent="viz-3"
      href={watch === null ? href.connect('watch') : href.device(watch)}
    >
      <StressContent />
    </WidgetFrame>
  );
}

export const STRESS_WIDGET: WidgetDefinition = {
  type: 'stress',
  title: 'Stress',
  icon: 'brain',
  sizes: allSizes('M', 'W'),
  defaultSize: 'M',
  render: () => <StressWidget />,
};
