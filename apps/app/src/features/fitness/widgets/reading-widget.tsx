import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { FillChart } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import type { IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { WidgetFrame } from '../../../components/widget-board';
import { rowLayoutOf, type RowLayout } from '../../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { ColourRole } from '../../../design/tokens';
import { AgeBadge } from '../components/age-badge';
import { DeltaLine, QuickStats, type QuickStat } from '../components/glance-parts';
import { freshnessOf } from '../model/freshness';
import type { MetricGlance } from '../model/glance';

export interface ReadingWidgetProps {
  readonly title: string;
  readonly icon: IconName;
  readonly href: Href;
  readonly day: string;
  readonly glance: MetricGlance;
  readonly format: (value: number) => string;
  readonly digits: number;
  readonly unit: string;
  readonly colour: ColourRole;
  readonly kind: 'line' | 'bars';
  readonly empty: string;
  readonly against: string;
  readonly caption?: string;
  readonly reference?: number | null;
}

function statsOf(props: ReadingWidgetProps): readonly QuickStat[] {
  const { glance, format } = props;
  const shown = (value: number | null): string => (value === null ? '—' : format(value));
  return [
    { label: 'Average', value: shown(glance.average) },
    { label: 'Low', value: shown(glance.low) },
    { label: 'High', value: shown(glance.high) },
  ];
}

function Headline({
  widget,
  big,
}: {
  readonly widget: ReadingWidgetProps;
  readonly big: boolean;
}): ReactNode {
  const { glance, day } = widget;
  const latest = glance.latest;
  if (latest === null) {
    return null;
  }
  return (
    <View className="gap-1">
      <Figure
        value={widget.format(latest.value)}
        unit={widget.unit}
        size={big ? 'l' : 'm'}
        stale={freshnessOf(latest.day, day).stale}
      />
      {glance.delta === null ? null : (
        <DeltaLine
          delta={glance.delta}
          digits={widget.digits}
          unit={widget.unit}
          against={widget.against}
        />
      )}
      {widget.caption === undefined ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {widget.caption}
        </Text>
      )}
    </View>
  );
}

function Chart({ widget }: { readonly widget: ReadingWidgetProps }): ReactNode {
  return (
    <FillChart
      values={widget.glance.values}
      kind={widget.kind}
      colour={widget.colour}
      reference={widget.reference ?? widget.glance.average}
      label={`${widget.title}, last ${String(widget.glance.values.length)} days`}
    />
  );
}

function Body({
  widget,
  layout,
}: {
  readonly widget: ReadingWidgetProps;
  readonly layout: RowLayout;
}): ReactNode {
  switch (layout) {
    case 'tile':
      return (
        <View className="flex-1 gap-2">
          <Headline widget={widget} big={false} />
          <Chart widget={widget} />
        </View>
      );
    case 'split':
      return (
        <View className="flex-1 flex-row gap-4">
          <View className="min-w-0 shrink justify-between">
            <Headline widget={widget} big />
          </View>
          <Chart widget={widget} />
        </View>
      );
    case 'wide':
      return (
        <View className="flex-1 flex-row gap-6">
          <View className="w-1/4 justify-center">
            <Headline widget={widget} big />
          </View>
          <Chart widget={widget} />
          <View className="w-1/5 justify-center">
            <QuickStats stats={statsOf(widget)} vertical />
          </View>
        </View>
      );
    case 'tall':
      return (
        <View className="flex-1 gap-3">
          <Headline widget={widget} big />
          <Chart widget={widget} />
          <QuickStats stats={statsOf(widget)} />
        </View>
      );
  }
}

export function ReadingWidget(widget: ReadingWidgetProps): ReactNode {
  const { glance, day } = widget;
  const { cls } = useWidgetFace();
  const latest = glance.latest;
  return (
    <WidgetFrame
      title={widget.title}
      icon={widget.icon}
      accent={widget.colour}
      href={widget.href}
      action={latest === null ? undefined : <AgeBadge day={latest.day} selected={day} />}
    >
      {latest === null ? (
        <Text variant="callout" tone="variant">
          {widget.empty}
        </Text>
      ) : (
        <Body widget={widget} layout={rowLayoutOf(cls)} />
      )}
    </WidgetFrame>
  );
}
