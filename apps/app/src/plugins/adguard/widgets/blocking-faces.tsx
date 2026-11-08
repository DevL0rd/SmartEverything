import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { ServiceMedallion } from '../../shared/service-medallion';
import {
  figureFitOf,
  GraphFill,
  type FigureFit,
  type ServiceLayout,
} from '../../shared/service-widget-frame';
import { hourlyStack } from '../model/chart-model';
import type { BlockingView } from './blocking-model';
import { Caption, StaleLine } from './blocking-parts';
import { stoppedLinesOf, topRowsOf } from './frame-faces';
import { MiniStack } from './mini-stack';
import type { BlockingReady } from './blocking-widget-frame';

const MINI_HOURS = 24;

export interface BlockingFaceProps {
  readonly ready: BlockingReady;
  readonly layout: ServiceLayout;
  readonly view: BlockingView;
}

function barsOf({ ready, view }: BlockingFaceProps, hours: number): ReturnType<typeof hourlyStack> {
  return hourlyStack(view.stats, ready.snapshot.at).slice(-hours);
}

function TileText({ view }: { readonly view: BlockingView }): ReactNode {
  if (view.stale !== null) {
    return (
      <>
        <Figure value={view.percent} unit="%" size="m" stale />
        <StaleLine caption={view.stale} short />
      </>
    );
  }
  if (view.protection === 'on') {
    return (
      <>
        <Figure value={view.percent} unit="%" size="m" />
        <Text variant="caption" tone="variant" numberOfLines={1}>
          blocked
        </Text>
      </>
    );
  }
  return (
    <>
      <Text variant="body-strong" tone="warning" numberOfLines={1}>
        {view.protection === 'off' ? 'Off' : 'Paused'}
      </Text>
      {view.until === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {view.until}
        </Text>
      )}
    </>
  );
}

function Tile({ view }: BlockingFaceProps): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <ServiceMedallion
        glyph="shield"
        tone={view.tone}
        ratio={view.ratio}
        live={false}
        size="widget"
        label={view.stale === null ? view.spoken : view.stale.long}
        offline={view.stale !== null}
      />
      <View className="min-w-0 flex-1">
        <TileText view={view} />
      </View>
    </View>
  );
}

function Stopped({ view, layout }: Pick<BlockingFaceProps, 'view' | 'layout'>): ReactNode {
  const lines = stoppedLinesOf(layout.room, layout.idiom);
  return (
    <View>
      <Text variant="title-3" tone="warning" numberOfLines={lines.headline}>
        {view.headline}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={lines.detail}>
        {view.detail}
      </Text>
    </View>
  );
}

function Reading({
  view,
  fit,
}: {
  readonly view: BlockingView;
  readonly fit: FigureFit;
}): ReactNode {
  return (
    <View className={fit.gap}>
      <Figure value={view.percent} unit="% blocked" size={fit.figure} stale={view.stale !== null} />
      <Caption text={view.share} stale={view.stale} variant={fit.caption} />
    </View>
  );
}

function Hours(props: BlockingFaceProps): ReactNode {
  return props.view.stale === null ? (
    <GraphFill spaced>
      {(height) => <MiniStack bars={barsOf(props, MINI_HOURS)} height={height} />}
    </GraphFill>
  ) : null;
}

function Compact(props: BlockingFaceProps): ReactNode {
  return (
    <View className="flex-1">
      <Reading view={props.view} fit={figureFitOf(props.layout.room, props.layout.idiom)} />
      <Hours {...props} />
    </View>
  );
}

function TopBlocked({
  view,
  rows,
}: {
  readonly view: BlockingView;
  readonly rows: number;
}): ReactNode {
  const entries = view.stats.topBlocked.slice(0, rows);
  return entries.length === 0 ? null : (
    <View className="gap-1">
      <Text variant="label" tone="variant">
        Top blocked
      </Text>
      {entries.map((entry) => (
        <View key={entry.name} className="min-h-6 flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <Text variant="footnote" ellipsize="middle">
              {entry.name}
            </Text>
          </View>
          <Text variant="caption" tone="variant" className="tabular">
            {count(entry.count)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Tall(props: BlockingFaceProps): ReactNode {
  const { view, layout } = props;
  return (
    <View className="flex-1">
      <Compact {...props} />
      {view.stale === null ? (
        <GraphFill spaced edge="start" least={0}>
          {(height) => <TopBlocked view={view} rows={topRowsOf(height, layout.idiom)} />}
        </GraphFill>
      ) : null}
    </View>
  );
}

function Wide(props: BlockingFaceProps): ReactNode {
  return (
    <View className="flex-1 flex-row gap-6">
      <View className="w-1/3">
        <Reading view={props.view} fit={figureFitOf(props.layout.room, props.layout.idiom)} />
      </View>
      <View className="min-w-0 flex-1">
        <Hours {...props} />
      </View>
    </View>
  );
}

export function BlockingFace(props: BlockingFaceProps): ReactNode {
  const { face } = props.layout;
  if (face === 'tile') {
    return <Tile {...props} />;
  }
  if (props.view.stale === null && props.view.protection !== 'on') {
    return <Stopped view={props.view} layout={props.layout} />;
  }
  switch (face) {
    case 'compact':
      return <Compact {...props} />;
    case 'tall':
      return <Tall {...props} />;
    case 'wide':
    case 'wide-tall':
      return <Wide {...props} />;
  }
}
