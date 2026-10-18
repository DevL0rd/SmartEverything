import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { ServiceMedallion } from '../../shared/service-medallion';
import { hourlyStack } from '../model/chart-model';
import type { BlockingView } from './blocking-model';
import { Caption, Resume, StaleLine } from './blocking-parts';
import {
  blockingFaceOf,
  bodyHeightOf,
  compactLayoutOf,
  topRowsOf,
  wideBarsHeightOf,
} from './frame-faces';
import { MiniStack } from './mini-stack';
import type { BlockingReady } from './blocking-widget-frame';

const MINI_HOURS = 24;

export interface BlockingFaceProps {
  readonly ready: BlockingReady;
  readonly view: BlockingView;
  readonly onResume: (() => Promise<unknown>) | null;
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

type StoppedProps = Pick<BlockingFaceProps, 'view' | 'onResume'>;

function Stopped({ view, onResume }: StoppedProps): ReactNode {
  return (
    <View className="flex-1 gap-1">
      <View className="flex-row items-center gap-2">
        <Text variant="title-3" tone="warning" numberOfLines={2} className="min-w-0 flex-1">
          {view.headline}
        </Text>
        {onResume === null ? null : <Resume onResume={onResume} />}
      </View>
      <Text variant="footnote" tone="variant">
        {view.detail}
      </Text>
    </View>
  );
}

function Compact(props: BlockingFaceProps): ReactNode {
  const { view } = props;
  const { frame } = useWidgetFace();
  const layout = compactLayoutOf(bodyHeightOf(frame));
  const bars = view.stale === null ? layout.bars : null;
  return (
    <View className="gap-1.5">
      <Figure
        value={view.percent}
        unit="% blocked"
        size={layout.figure}
        stale={view.stale !== null}
      />
      <Caption text={view.share} stale={view.stale} />
      {bars === null ? null : <MiniStack bars={barsOf(props, MINI_HOURS)} height={bars} />}
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
  return rows === 0 || entries.length === 0 ? null : (
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
  const { frame } = useWidgetFace();
  return (
    <View className="flex-1 justify-between gap-2">
      <Compact {...props} />
      {props.view.stale === null ? (
        <TopBlocked view={props.view} rows={topRowsOf(bodyHeightOf(frame))} />
      ) : null}
    </View>
  );
}

function Wide(props: BlockingFaceProps): ReactNode {
  const { view } = props;
  const { frame } = useWidgetFace();
  return (
    <View className="flex-1 flex-row items-center gap-6">
      <View className="w-1/3 gap-1.5">
        <Figure value={view.percent} unit="% blocked" size="l" stale={view.stale !== null} />
        <Caption text={view.share} stale={view.stale} />
      </View>
      <View className="min-w-0 flex-1">
        {view.stale === null ? (
          <MiniStack
            bars={barsOf(props, MINI_HOURS)}
            height={wideBarsHeightOf(bodyHeightOf(frame))}
          />
        ) : null}
      </View>
    </View>
  );
}

export function BlockingFace(props: BlockingFaceProps): ReactNode {
  const { cls } = useWidgetFace();
  const face = blockingFaceOf(cls);
  if (face === 'tile') {
    return <Tile {...props} />;
  }
  if (props.view.stale === null && props.view.protection !== 'on') {
    return <Stopped view={props.view} onResume={props.onResume} />;
  }
  switch (face) {
    case 'compact':
      return <Compact {...props} />;
    case 'tall':
      return <Tall {...props} />;
    case 'wide':
      return <Wide {...props} />;
  }
}
