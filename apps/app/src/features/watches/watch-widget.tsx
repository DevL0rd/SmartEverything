import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { WidgetSize } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Text } from '../../components/text';
import {
  WidgetEmpty,
  WidgetFrame,
  boardClassOf,
  type WidgetDefinition,
} from '../../components/widget-board';
import { useSizeClass } from '../../design/size-class';
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

type Layout = 'square' | 'strip' | 'wide' | 'tall' | 'stage';

function layoutOf(size: WidgetSize, compact: boolean): Layout {
  switch (size) {
    case 'S':
      return 'square';
    case 'M':
      return 'strip';
    case 'W':
      return compact ? 'strip' : 'wide';
    case 'L':
      return 'tall';
    case 'XL':
      return compact ? 'tall' : 'stage';
  }
}

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
      <View className="w-56 gap-2">
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
      <View className="w-96">
        <Tiles facts={facts} columns={2} />
      </View>
    </View>
  );
}

function Glance({ watch, size }: { readonly watch: Device; readonly size: WidgetSize }): ReactNode {
  const now = useMinute();
  const compact = boardClassOf(useSizeClass().width) === 'compact';
  const { glance, live } = useWatchGlance(watch);
  const layout = layoutOf(size, compact);
  const props = { watch, glance, live, facts: factsOf(glance, now) };
  switch (layout) {
    case 'square':
      return <Square {...props} />;
    case 'strip':
      return <Strip {...props} />;
    case 'wide':
      return <Wide {...props} />;
    case 'tall':
      return <Tall {...props} chart={size === 'XL'} />;
    case 'stage':
      return <Stage {...props} />;
  }
}

function HeaderAction({
  watch,
  size,
}: {
  readonly watch: Device;
  readonly size: WidgetSize;
}): ReactNode {
  const { glance } = useWatchGlance(watch);
  if (size === 'S') {
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

function WatchWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const watch = useMyWatch();
  if (watch === null) {
    return (
      <WidgetFrame
        title="Watch"
        icon="watch"
        accent="stand"
        href={href.connect('watch')}
        size={size}
      >
        <WidgetEmpty
          icon="watch"
          colour="stand"
          title="Add your watch"
          body="See steps, heart rate and battery here."
          action={{ label: 'Add watch', href: href.connect('watch') }}
          size={size}
        />
      </WidgetFrame>
    );
  }
  return (
    <WidgetFrame
      title={size === 'S' ? 'Watch' : watch.label}
      icon="watch"
      accent="stand"
      href={href.device(watch)}
      action={<HeaderAction watch={watch} size={size} />}
      size={size}
    >
      <Glance watch={watch} size={size} />
    </WidgetFrame>
  );
}

const SIZES = ['S', 'M', 'W', 'L', 'XL'] as const;

export const WATCH_WIDGET: WidgetDefinition = {
  type: 'watch',
  title: 'Watch',
  icon: 'watch',
  sizes: { compact: SIZES, medium: SIZES, expanded: SIZES },
  defaultSize: 'M',
  render: ({ size }) => <WatchWidget size={size} />,
};
