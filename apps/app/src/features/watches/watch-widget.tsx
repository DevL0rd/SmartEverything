import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Text } from '../../components/text';
import {
  ActionBand,
  WidgetEmpty,
  WidgetFrame,
  type WidgetDefinition,
} from '../../components/widget-board';
import { allSizes, faceLayoutOf, isTile } from '../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../components/widget-board/use-widget-face';
import { cn } from '../../design/cn';
import { useMinute } from '../../store/clock';
import type { Device } from '../../store/state';
import { DeviceVisual, SIZE_CLASS, useWatchVisualState, type WatchLive } from '../device-visuals';
import { WideArt, useWideArt } from '../devices';
import { FactChip, FactTile, SyncButton, factsOf, type Fact } from './watch-facts';
import { useMyWatch, useWatchGlance, type WatchGlance } from './watch-glance';
import { StepsBlock, WeekSteps } from './watch-steps-block';

const TILE_ART_PX = 48;

function Art({ watch, live }: { readonly watch: Device; readonly live: WatchLive }): ReactNode {
  const state = useWatchVisualState(watch, live);
  const { cls } = useWidgetFace();
  const art = useWideArt();
  if (isTile(cls)) {
    return (
      <View
        className={cn('shrink-0 items-center justify-center self-start', SIZE_CLASS[TILE_ART_PX])}
      >
        <DeviceVisual device={watch} size="card" px={TILE_ART_PX} state={state} />
      </View>
    );
  }
  return (
    <WideArt cls={art.cls}>
      <DeviceVisual device={watch} size="card" px={art.px} state={state} />
    </WideArt>
  );
}

function Chips({ facts }: { readonly facts: readonly Fact[] }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-x-3 gap-y-1">
      {facts.map((item) => (
        <FactChip key={item.key} fact={item} />
      ))}
    </View>
  );
}

function rowsOf(facts: readonly Fact[], columns: number): readonly (readonly Fact[])[] {
  return Array.from({ length: Math.ceil(facts.length / columns) }, (_, index) =>
    facts.slice(index * columns, index * columns + columns),
  );
}

function Tiles({
  facts,
  columns,
}: {
  readonly facts: readonly Fact[];
  readonly columns: 2 | 4;
}): ReactNode {
  return (
    <View className="gap-2">
      {rowsOf(facts, columns).map((row) => (
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
  readonly facts: readonly Fact[];
}

function Split({ glance, facts }: BodyProps): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <StepsBlock glance={glance} size="s" />
      <Chips facts={facts.filter((item) => item.key === 'heart' || item.key === 'battery')} />
    </View>
  );
}

function Wide({ glance, facts }: BodyProps): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row gap-4">
      <View className="w-1/4">
        <StepsBlock glance={glance} size="m" />
      </View>
      <View className="min-w-0 flex-1">
        <Tiles facts={facts} columns={4} />
      </View>
    </View>
  );
}

function Tall({ watch, glance, facts }: BodyProps): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-3">
      <StepsBlock glance={glance} size="l" />
      <WeekSteps watch={watch} glance={glance} />
      <Chips facts={facts} />
    </View>
  );
}

function Report({ watch, glance, facts }: BodyProps): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row gap-4">
      <View className="min-w-0 flex-1 gap-3">
        <StepsBlock glance={glance} size="xl" />
        <WeekSteps watch={watch} glance={glance} />
      </View>
      <View className="min-w-0 flex-1">
        <Tiles facts={facts} columns={2} />
      </View>
    </View>
  );
}

function Content(props: BodyProps): ReactNode {
  switch (faceLayoutOf(useWidgetFace().cls)) {
    case 'tile':
      return null;
    case 'split':
      return <Split {...props} />;
    case 'wide':
      return <Wide {...props} />;
    case 'tall':
      return <Tall {...props} />;
    case 'report':
      return <Report {...props} />;
  }
}

function Glance({
  watch,
  glance,
  live,
}: {
  readonly watch: Device;
  readonly glance: WatchGlance;
  readonly live: WatchLive;
}): ReactNode {
  const now = useMinute();
  const { cls } = useWidgetFace();
  const tile = isTile(cls);
  return (
    <View className={cn('flex-1 flex-row', cls === 'm' || tile ? 'gap-3' : 'gap-4')}>
      <Art watch={watch} live={live} />
      {tile ? null : (
        <View className="min-w-0 flex-1 flex-row gap-2">
          <Content watch={watch} glance={glance} facts={factsOf(glance, now)} />
          {glance.onThisPhone ? (
            <ActionBand>
              <SyncButton glance={glance} />
            </ActionBand>
          ) : null}
        </View>
      )}
    </View>
  );
}

function BatteryBadge({ glance }: { readonly glance: WatchGlance }): ReactNode {
  return glance.battery === null ? null : (
    <Text variant="footnote" tone={glance.battery < 20 ? 'warning' : 'variant'} className="tabular">
      {`${String(glance.battery)}%`}
    </Text>
  );
}

function WatchFrame({ watch }: { readonly watch: Device }): ReactNode {
  const { glance, live } = useWatchGlance(watch);
  const tile = isTile(useWidgetFace().cls);
  return (
    <WidgetFrame
      title={tile ? 'Watch' : watch.label}
      icon="watch"
      accent="stand"
      href={href.device(watch)}
      badge={tile ? <BatteryBadge glance={glance} /> : undefined}
    >
      <Glance watch={watch} glance={glance} live={live} />
    </WidgetFrame>
  );
}

function WatchWidget(): ReactNode {
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
  return <WatchFrame watch={watch} />;
}

export const WATCH_WIDGET: WidgetDefinition = {
  type: 'watch',
  title: 'Watch',
  icon: 'watch',
  sizes: allSizes('M', 'W', 'XL'),
  defaultSize: 'M',
  render: () => <WatchWidget />,
};
