import type { SpeedTestResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Bars } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { plural } from '../../../format/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { HeroModel } from '../overview/hero-model';
import type { SpeedTestRun } from '../router-data';
import { ServiceMedallion } from '../../shared/service-medallion';
import { bodyHeightOf, internetFaceOf } from './frame-faces';
import { compactLayoutOf, pairHeightOf, testBars } from './internet-model';
import { Caption, DownNotice, Figures, isDown, Progress, StaleLine, Trend } from './internet-parts';
import type { RouterReady } from './router-widget-frame';
import { staleCaptionOf } from './stale-caption';

const HISTORY_BAR_HEIGHT = 56;
const TREND_HOURS = 6;
const DAY_HOURS = 24;

export interface InternetFaceProps {
  readonly ready: RouterReady;
  readonly hero: HeroModel;
  readonly run: SpeedTestRun;
  readonly tests: readonly SpeedTestResult[];
}

function Tile({ ready, hero, run }: InternetFaceProps): ReactNode {
  const stale = staleCaptionOf(ready.snapshot.connection, ready.now);
  const [download] = hero.figures;
  return (
    <View className="flex-row items-center gap-2">
      <ServiceMedallion
        glyph="router"
        tone={hero.tone}
        ratio={hero.ratio}
        live={run.running}
        size="widget"
        label={hero.spoken}
        offline={hero.stale}
      />
      <View className="min-w-0 flex-1">
        {isDown(hero) ? (
          <>
            <DownNotice size="tile" />
            <Text variant="caption" tone="variant" numberOfLines={1}>
              No traffic
            </Text>
          </>
        ) : (
          <>
            <Figure value={download.value} size="m" stale={hero.stale} />
            {stale === null ? (
              <Text variant="caption" tone="variant" numberOfLines={1}>
                {download.unit === undefined ? 'Download' : `${download.unit} ↓`}
              </Text>
            ) : (
              <StaleLine text={stale.short} spoken={stale.long} critical={stale.critical} />
            )}
          </>
        )}
      </View>
    </View>
  );
}

function Compact(props: InternetFaceProps): ReactNode {
  const { ready, hero, run } = props;
  const { frame } = useWidgetFace();
  const layout = compactLayoutOf(bodyHeightOf(frame));
  const trend = hero.stale ? null : layout.trend;
  return (
    <View className={layout.tight ? 'gap-1' : 'gap-1.5'}>
      <Figures hero={hero} size={layout.figure} />
      {run.running ? <Progress run={run} /> : null}
      {!run.running && trend !== null ? (
        <Trend
          deviceId={ready.device.id}
          snapshot={ready.snapshot}
          capability="download_rate"
          hours={TREND_HOURS}
          colour="viz-1"
          height={trend}
        />
      ) : null}
      <Caption
        snapshot={ready.snapshot}
        hero={hero}
        last={props.tests[0] ?? null}
        now={ready.now}
      />
    </View>
  );
}

function History({ tests }: { readonly tests: readonly SpeedTestResult[] }): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="label" tone="variant">
        Last 6 tests
      </Text>
      {tests.length === 0 ? (
        <Text variant="footnote" tone="variant">
          No speed tests yet
        </Text>
      ) : (
        <View aria-hidden>
          <Bars
            bars={testBars(tests)}
            colour="viz-1"
            label="Download of the last 6 tests"
            height={HISTORY_BAR_HEIGHT}
          />
        </View>
      )}
    </View>
  );
}

function Tall(props: InternetFaceProps): ReactNode {
  const online = props.ready.snapshot.clients.filter((client) => client.connected).length;
  return (
    <View className="flex-1 justify-between gap-2">
      <Compact {...props} />
      <History tests={props.tests} />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {`${plural(online, 'device')} online`}
      </Text>
    </View>
  );
}

function Pair({ ready, hero }: InternetFaceProps): ReactNode {
  const { frame } = useWidgetFace();
  const height = pairHeightOf(bodyHeightOf(frame));
  const rows = [
    { label: 'Download', capability: 'download_rate', colour: 'viz-1', swatch: 'bg-viz-1' },
    { label: 'Upload', capability: 'upload_rate', colour: 'viz-2', swatch: 'bg-viz-2' },
  ] as const;
  return (
    <View className="flex-1 gap-2">
      {rows.map((row) => (
        <View key={row.label} className="flex-row items-center gap-2">
          <View aria-hidden className={cn('size-2.5 rounded-full', row.swatch)} />
          <Text variant="caption" tone="variant" className="w-14">
            {row.label}
          </Text>
          <View className={cn('min-w-0 flex-1', hero.stale && 'opacity-60')}>
            <Trend
              deviceId={ready.device.id}
              snapshot={ready.snapshot}
              capability={row.capability}
              hours={DAY_HOURS}
              colour={row.colour}
              height={height}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function Wide(props: InternetFaceProps): ReactNode {
  const { ready, hero, run } = props;
  return (
    <View className="flex-1 flex-row items-center gap-6">
      <View className="w-2/5 gap-1.5">
        <Figures hero={hero} size="l" />
        <Caption
          snapshot={ready.snapshot}
          hero={hero}
          last={props.tests[0] ?? null}
          now={ready.now}
        />
      </View>
      {run.running ? (
        <View className="flex-1">
          <Progress run={run} />
        </View>
      ) : (
        <Pair {...props} />
      )}
    </View>
  );
}

export function InternetFace(props: InternetFaceProps): ReactNode {
  const { cls } = useWidgetFace();
  switch (internetFaceOf(cls)) {
    case 'tile':
      return <Tile {...props} />;
    case 'compact':
      return <Compact {...props} />;
    case 'tall':
      return <Tall {...props} />;
    case 'wide':
      return <Wide {...props} />;
  }
}
