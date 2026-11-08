import type { SpeedTestResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Bars } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { plural } from '../../../format/text';
import type { HeroModel } from '../overview/hero-model';
import type { SpeedTestRun } from '../router-data';
import { ServiceMedallion } from '../../shared/service-medallion';
import {
  figureFitOf,
  GraphFill,
  type FigureFit,
  type ServiceLayout,
} from '../../shared/service-widget-frame';
import { testBars } from './internet-model';
import { Caption, DownNotice, Figures, isDown, Progress, StaleLine, Trend } from './internet-parts';
import type { RouterReady } from './router-widget-frame';
import { staleCaptionOf } from './stale-caption';

const TREND_HOURS = 6;
const DAY_HOURS = 24;
const PROGRESS_LEAST = 12;

export interface InternetFaceProps {
  readonly ready: RouterReady;
  readonly layout: ServiceLayout;
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

function Reading({
  ready,
  hero,
  tests,
  fit,
}: Pick<InternetFaceProps, 'ready' | 'hero' | 'tests'> & { readonly fit: FigureFit }): ReactNode {
  return (
    <View className={fit.gap}>
      <Figures hero={hero} size={fit.figure} />
      <Caption
        snapshot={ready.snapshot}
        hero={hero}
        last={tests[0] ?? null}
        now={ready.now}
        variant={fit.caption}
      />
    </View>
  );
}

function Motion({
  ready,
  hero,
  run,
}: Pick<InternetFaceProps, 'ready' | 'hero' | 'run'>): ReactNode {
  if (run.running) {
    return (
      <GraphFill spaced least={PROGRESS_LEAST}>
        {() => <Progress run={run} />}
      </GraphFill>
    );
  }
  return hero.stale ? null : (
    <GraphFill spaced>
      {(height) => (
        <Trend
          deviceId={ready.device.id}
          snapshot={ready.snapshot}
          capability="download_rate"
          hours={TREND_HOURS}
          colour="viz-1"
          height={height}
        />
      )}
    </GraphFill>
  );
}

function Compact(props: InternetFaceProps): ReactNode {
  const fit = figureFitOf(props.layout.room, props.layout.idiom);
  return (
    <View className="flex-1">
      <Reading {...props} fit={fit} />
      <Motion {...props} />
    </View>
  );
}

function History({ tests }: { readonly tests: readonly SpeedTestResult[] }): ReactNode {
  return (
    <View className="min-h-0 flex-1 gap-1 pt-2">
      <Text variant="label" tone="variant">
        Last 6 tests
      </Text>
      {tests.length === 0 ? (
        <Text variant="footnote" tone="variant">
          No speed tests yet
        </Text>
      ) : (
        <GraphFill>
          {(height) => (
            <View aria-hidden>
              <Bars
                bars={testBars(tests)}
                colour="viz-1"
                label="Download of the last 6 tests"
                height={height}
              />
            </View>
          )}
        </GraphFill>
      )}
    </View>
  );
}

function Tall(props: InternetFaceProps): ReactNode {
  const online = props.ready.snapshot.clients.filter((client) => client.connected).length;
  const fit = figureFitOf(props.layout.room, props.layout.idiom);
  return (
    <View className="flex-1">
      <View className="gap-1">
        <Reading {...props} fit={fit} />
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {`${plural(online, 'device')} online`}
        </Text>
      </View>
      <Motion {...props} />
      <History tests={props.tests} />
    </View>
  );
}

const SERIES = [
  { label: 'Download', capability: 'download_rate', colour: 'viz-1', swatch: 'bg-viz-1' },
  { label: 'Upload', capability: 'upload_rate', colour: 'viz-2', swatch: 'bg-viz-2' },
] as const;

function Pair({ ready, hero, layout }: InternetFaceProps): ReactNode {
  return (
    <View className={cn('flex-1', layout.face === 'wide' ? 'flex-row gap-4' : 'gap-2')}>
      {SERIES.map((row) => (
        <View key={row.label} className="min-h-0 flex-1 flex-row items-center gap-2">
          <View aria-hidden className={cn('size-2.5 rounded-full', row.swatch)} />
          <Text variant="caption" tone="variant" className="w-14">
            {row.label}
          </Text>
          <View className={cn('min-w-0 flex-1 self-stretch', hero.stale && 'opacity-60')}>
            <GraphFill>
              {(height) => (
                <Trend
                  deviceId={ready.device.id}
                  snapshot={ready.snapshot}
                  capability={row.capability}
                  hours={DAY_HOURS}
                  colour={row.colour}
                  height={height}
                />
              )}
            </GraphFill>
          </View>
        </View>
      ))}
    </View>
  );
}

function Wide(props: InternetFaceProps): ReactNode {
  const fit = figureFitOf(props.layout.room, props.layout.idiom);
  return (
    <View className="flex-1 flex-row gap-6">
      <View className="w-2/5">
        <Reading {...props} fit={fit} />
      </View>
      {props.run.running ? (
        <View className="flex-1 justify-center">
          <Progress run={props.run} />
        </View>
      ) : (
        <Pair {...props} />
      )}
    </View>
  );
}

export function InternetFace(props: InternetFaceProps): ReactNode {
  switch (props.layout.face) {
    case 'tile':
      return <Tile {...props} />;
    case 'compact':
      return <Compact {...props} />;
    case 'tall':
      return <Tall {...props} />;
    case 'wide':
    case 'wide-tall':
      return <Wide {...props} />;
  }
}
