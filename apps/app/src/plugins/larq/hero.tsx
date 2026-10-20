import type { BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import { LoadedQuery } from '../../components/loaded-query';
import { Text } from '../../components/text';
import { atLeast, useSizeClass } from '../../design/size-class';
import { minutesOfDay } from '../../format/time';
import { useMinute } from '../../store/clock';
import type { Device } from '../../store/state';
import { BottleActions } from './components/bottle-actions';
import { BottleFigure } from './components/bottle-figure';
import { FigureRow } from './components/figure-row';
import { InsightChips } from './components/insight-chips';
import { LightGuide, LightSheet } from './components/light-sheet';
import { BindingNotice } from './components/notice-card';
import { SourceBar } from './components/source-bar';
import { StateChip } from './components/state-chip';
import { TodayRing } from './components/today-ring';
import { useBottleStatus } from './data/bottle-data';
import { ageLine } from './model/bottle-model';

const RING_NARROW = 188;
const RING_WIDE = 208;

function TopLine({
  view,
  onLight,
}: {
  readonly view: BottleStatusView;
  readonly onLight: () => void;
}): ReactNode {
  const now = useMinute();
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-x-3">
      <View className="flex-row items-center gap-2">
        <StateChip view={view} />
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {ageLine(view, now)}
        </Text>
      </View>
      <LightGuide onPress={onLight} />
    </View>
  );
}

function Overview({
  device,
  view,
  onLight,
}: {
  readonly device: Device;
  readonly view: BottleStatusView;
  readonly onLight: () => void;
}): ReactNode {
  const wide = atLeast(useSizeClass().width, 'medium');
  const minute = minutesOfDay(useMinute());
  const { today } = view;
  const ring = (
    <TodayRing
      today={today}
      minuteOfDay={minute}
      size={wide ? RING_WIDE : RING_NARROW}
      label={wide}
    />
  );
  const details = (
    <>
      <FigureRow view={view} />
      <SourceBar
        parts={{ bottleMl: today.bottleMl, loggedMl: today.loggedMl, otherMl: today.otherMl }}
      />
    </>
  );
  return (
    <>
      <View className="flex-row items-center gap-6">
        <BottleFigure device={device} view={view} trim onCapPress={onLight} />
        {wide ? ring : <View className="flex-1 items-center">{ring}</View>}
        {wide ? <View className="min-w-0 flex-1 gap-5">{details}</View> : null}
      </View>
      {wide ? null : details}
    </>
  );
}

function HeroCard({
  device,
  view,
}: {
  readonly device: Device;
  readonly view: BottleStatusView;
}): ReactNode {
  const [light, setLight] = useState(false);
  const show = (): void => {
    setLight(true);
  };
  return (
    <Card>
      <View className="gap-5">
        <BindingNotice view={view} />
        <TopLine view={view} onLight={show} />
        <Overview device={device} view={view} onLight={show} />
        <InsightChips view={view} skip={['pace']} />
        <BottleActions view={view} />
      </View>
      <LightSheet
        open={light}
        onClose={() => {
          setLight(false);
        }}
      />
    </Card>
  );
}

export function BottleHero({ device }: { readonly device: Device }): ReactNode {
  const status = useBottleStatus(device.id);
  return (
    <LoadedQuery query={status}>{(view) => <HeroCard device={device} view={view} />}</LoadedQuery>
  );
}
