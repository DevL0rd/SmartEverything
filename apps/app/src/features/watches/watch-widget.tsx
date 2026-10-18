import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { WidgetSize } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Text } from '../../components/text';
import { WidgetEmpty, WidgetFrame, type WidgetDefinition } from '../../components/widget-board';
import { allSizes, faceLayoutOf, isTile } from '../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../components/widget-board/use-widget-face';
import { useMinute } from '../../store/clock';
import type { Device } from '../../store/state';
import {
  DeviceVisual,
  useWatchVisualState,
  type VisualPx,
  type WatchLive,
} from '../device-visuals';
import { FactChip, FactTile, SyncButton, factsOf, type Fact } from './watch-facts';
import { useMyWatch, useWatchGlance, type WatchGlance } from './watch-glance';
import { StepsBlock, WeekSteps } from './watch-steps-block';

function Face({
  watch,
  live,
  px,
}: {
  readonly watch: Device;
  readonly live: WatchLive;
  readonly px?: VisualPx;
}): ReactNode {
  const state = useWatchVisualState(watch, live);
  return (
    <DeviceVisual
      device={watch}
      size={px === undefined ? 'card' : 'hero'}
      state={state}
      {...(px === undefined ? {} : { px })}
    />
  );
}

function Chips({ facts }: { readonly facts: readonly Fact[] }): ReactNode {
  return (
    <View className="flex-row gap-4 overflow-hidden">
      {facts.map((item) => (
        <FactChip key={item.key} fact={item} />
      ))}
    </View>
  );
}

function Tiles({
  facts,
  columns,
}: {
  readonly facts: readonly Fact[];
  readonly columns: 2 | 4;
}): ReactNode {
  const rows = columns === 4 ? [facts.slice(0, 4)] : [facts.slice(0, 2), facts.slice(2, 4)];
  return (
    <View className="gap-2">
      {rows.map((row) => (
        <View key={row.map((item) => item.key).join()} className="flex-row gap-2">
          {row.map((item) => (
            <FactTile key={item.key} fact={item} />
          ))}
        </View>
      ))}
    </View>
  );
}

interface BodyProps {
  readonly watch: Device;
  readonly glance: WatchGlance;
  readonly live: WatchLive;
  readonly facts: readonly Fact[];
}

function Square({ watch, live }: BodyProps): ReactNode {
  return (
    <View className="flex-1 items-center justify-center">
      <Face watch={watch} live={live} />
    </View>
  );
}

function Strip({ watch, glance, live, facts }: BodyProps): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <Face watch={watch} live={live} />
      <View className="min-w-0 flex-1 gap-2">
        <StepsBlock glance={glance} size="m" />
        <Chips facts={facts.filter((item) => item.key === 'heart' || item.key === 'battery')} />
      </View>
    </View>
  );
}

function Wide({ watch, glance, live, facts }: BodyProps): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-5">
      <Face watch={watch} live={live} />
      <View className="w-1/4 gap-2">
        <StepsBlock glance={glance} size="l" />
      </View>
      <View className="min-w-0 flex-1">
        <Tiles facts={facts} columns={4} />
      </View>
    </View>
  );
}

function Tall({
  watch,
  glance,
  live,
  facts,
  chart,
}: BodyProps & { readonly chart: boolean }): ReactNode {
  return (
    <View className="flex-1 gap-3">
      <View className="flex-row items-center gap-4">
        <Face watch={watch} live={live} />
        <View className="min-w-0 flex-1">
          <StepsBlock glance={glance} size="l" />
        </View>
      </View>
      {chart ? <WeekSteps watch={watch} glance={glance} /> : <View className="flex-1" />}
      {chart ? (
        <Chips facts={facts.filter((item) => item.key !== 'sleep')} />
      ) : (
        <Tiles facts={facts} columns={2} />
      )}
    </View>
  );
}

function Stage({ watch, glance, live, facts }: BodyProps): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-6">
      <Face watch={watch} live={live} px={168} />
      <View className="min-w-0 flex-1 gap-3 self-stretch">
        <StepsBlock glance={glance} size="xl" />
        <WeekSteps watch={watch} glance={glance} />
      </View>
      <View className="w-2/5">
        <Tiles facts={facts} columns={2} />
      </View>
    </View>
  );
}

interface GlanceProps {
  readonly watch: Device;
  readonly glance: WatchGlance;
  readonly live: WatchLive;
  readonly size: WidgetSize;
}

function Glance({ watch, glance, live, size }: GlanceProps): ReactNode {
  const now = useMinute();
  const { cls } = useWidgetFace();
  const props = { watch, glance, live, facts: factsOf(glance, now) };
  switch (faceLayoutOf(cls)) {
    case 'tile':
      return <Square {...props} />;
    case 'split':
      return <Strip {...props} />;
    case 'wide':
      return <Wide {...props} />;
    case 'tall':
      return <Tall {...props} chart={size === 'XL'} />;
    case 'report':
      return <Stage {...props} />;
  }
}

function HeaderAction({
  glance,
  tile,
}: {
  readonly glance: WatchGlance;
  readonly tile: boolean;
}): ReactNode {
  if (tile) {
    return glance.battery === null ? null : (
      <Text
        variant="footnote"
        tone={glance.battery < 20 ? 'warning' : 'variant'}
        className="tabular"
      >
        {`${String(glance.battery)}%`}
      </Text>
    );
  }
  return <SyncButton glance={glance} />;
}

function WatchFrame({
  watch,
  size,
}: {
  readonly watch: Device;
  readonly size: WidgetSize;
}): ReactNode {
  const { glance, live } = useWatchGlance(watch);
  const tile = isTile(useWidgetFace().cls);
  return (
    <WidgetFrame
      title={tile ? 'Watch' : watch.label}
      icon="watch"
      accent="stand"
      href={href.device(watch)}
      action={<HeaderAction glance={glance} tile={tile} />}
    >
      <Glance watch={watch} glance={glance} live={live} size={size} />
    </WidgetFrame>
  );
}

function WatchWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const watch = useMyWatch();
  if (watch === null) {
    return (
      <WidgetFrame title="Watch" icon="watch" accent="stand" href={href.connect('watch')}>
        <WidgetEmpty
          icon="watch"
          colour="stand"
          title="Add your watch"
          body="See steps, heart rate and battery here."
          action={{ label: 'Add watch', href: href.connect('watch') }}
        />
      </WidgetFrame>
    );
  }
  return <WatchFrame watch={watch} size={size} />;
}

export const WATCH_WIDGET: WidgetDefinition = {
  type: 'watch',
  title: 'Watch',
  icon: 'watch',
  sizes: allSizes('M', 'W', 'XL'),
  defaultSize: 'M',
  render: ({ size }) => <WatchWidget size={size} />,
};
