import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { WidgetEmpty, WidgetFrame } from '../../../components/widget-board';
import { rowLayoutOf, type RowLayout } from '../../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useLastNight } from '../data/nights';
import { useTodayContext } from '../data/today';
import type { SleepNight } from '../model/sleep';
import { napFaceOf, type NapFace } from '../model/sleep-widget';
import {
  GhostChart,
  Goal,
  Headline,
  LegendColumn,
  LegendRow,
  NapBar,
  NightChart,
  Ring,
  TimesLine,
} from './sleep-widget-parts';

const RING_SPLIT_PX = 44;
const RING_STACKED_PX = 48;
const RING_WIDE_PX = 56;
const STACKED_CHART_PX = 56;

interface NightProps {
  readonly night: SleepNight;
  readonly goalMinutes: number;
}

function TileFace({ night, goalMinutes }: NightProps): ReactNode {
  return (
    <View className="gap-1.5">
      <Headline night={night} scale="s" />
      <Goal night={night} goalMinutes={goalMinutes} long={false} />
    </View>
  );
}

function SplitFace({ night, goalMinutes }: NightProps): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <View className="w-2/5 gap-1.5">
        <View className="flex-row items-center gap-2">
          <Ring night={night} goalMinutes={goalMinutes} size={RING_SPLIT_PX} />
          <Headline night={night} scale="s" />
        </View>
        <Goal night={night} goalMinutes={goalMinutes} long={false} />
      </View>
      <View className="min-w-0 flex-1">
        <NightChart night={night} />
      </View>
    </View>
  );
}

function WideFace({ night, goalMinutes }: NightProps): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-5">
      <View className="w-1/3 gap-1.5">
        <View className="flex-row items-center gap-3">
          <Ring night={night} goalMinutes={goalMinutes} size={RING_WIDE_PX} />
          <Headline night={night} scale="m" />
        </View>
        <TimesLine night={night} />
        <Goal night={night} goalMinutes={goalMinutes} long />
      </View>
      <View className="min-w-0 flex-1">
        <NightChart night={night} />
      </View>
      <View className="w-1/4">
        <LegendColumn night={night} />
      </View>
    </View>
  );
}

function StackedFace({ night, goalMinutes }: NightProps): ReactNode {
  return (
    <View className="flex-1 justify-between gap-2">
      <View className="flex-row items-center gap-3">
        <Ring night={night} goalMinutes={goalMinutes} size={RING_STACKED_PX} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Headline night={night} scale="m" />
          <TimesLine night={night} />
        </View>
        <View className="w-2/5">
          <Goal night={night} goalMinutes={goalMinutes} long />
        </View>
      </View>
      <NightChart night={night} height={STACKED_CHART_PX} />
      <LegendRow night={night} />
    </View>
  );
}

function NightFace({ layout, ...props }: NightProps & { readonly layout: RowLayout }): ReactNode {
  switch (layout) {
    case 'tile':
      return <TileFace {...props} />;
    case 'split':
      return <SplitFace {...props} />;
    case 'wide':
      return <WideFace {...props} />;
    case 'tall':
      return <StackedFace {...props} />;
  }
}

function NapFaceView({
  face,
  layout,
}: {
  readonly face: NapFace;
  readonly layout: RowLayout;
}): ReactNode {
  const headline = (
    <View className="min-w-0 gap-0.5">
      <Figure value={face.headline} size={layout === 'tile' ? 's' : 'm'} />
      <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
        {face.times}
      </Text>
    </View>
  );
  if (layout === 'tile') {
    return headline;
  }
  return (
    <View className={layout === 'tall' ? 'flex-1 justify-between gap-3' : 'flex-1 flex-row gap-5'}>
      <View className={layout === 'tall' ? '' : 'w-2/5 justify-center'}>{headline}</View>
      <View className={layout === 'tall' ? '' : 'min-w-0 flex-1 justify-center'}>
        <NapBar face={face} />
      </View>
    </View>
  );
}

function EmptyFace({ layout }: { readonly layout: RowLayout }): ReactNode {
  return (
    <View className="flex-1 justify-between gap-2">
      <WidgetEmpty
        icon="moon"
        colour="sleep-core"
        title="No sleep recorded"
        body="Wear your watch to bed to see last night here."
      />
      {layout === 'tile' ? null : <GhostChart />}
    </View>
  );
}

export function SleepWidget(): ReactNode {
  const { day, goals } = useTodayContext();
  const { night, naps } = useLastNight(day);
  const { cls } = useWidgetFace();
  const layout = rowLayoutOf(cls);
  const nap = night === null ? napFaceOf(naps) : null;
  const face =
    night !== null ? (
      <NightFace night={night} goalMinutes={goals.sleep_minutes} layout={layout} />
    ) : nap !== null ? (
      <NapFaceView face={nap} layout={layout} />
    ) : (
      <EmptyFace layout={layout} />
    );
  return (
    <WidgetFrame
      title="Sleep"
      icon="moon"
      accent="sleep-core"
      href={href.fitnessPage('sleep', { day })}
    >
      {face}
    </WidgetFrame>
  );
}
