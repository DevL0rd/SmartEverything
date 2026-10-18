import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sparkline } from '../../../components/charts';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { StreamProblem } from '../../shared/plugin-notice';
import { ServiceHero, ServiceHeroSkeleton } from '../../shared/service-hero';
import { ServiceMedallion } from '../../shared/service-medallion';
import { useRouterSnapshot, useSpeedTestRun, useSpeedTests } from '../router-data';
import { SpeedTestSheet } from '../speed-test-sheet';
import { heroOf, type HeroModel } from './hero-model';
import { useMegabitSeries } from './use-router-series';
import { useSpeedTestControls, type SpeedTestControls } from './use-speed-test';

const ASIDE_HOURS = 6;
const ASIDE_HEIGHT = 48;

function HeroAside({ device }: { readonly device: Device }): ReactNode {
  const series = useMegabitSeries(device.id, 'download_rate', ASIDE_HOURS);
  if (series.points.length < 2) {
    return null;
  }
  return (
    <View className="gap-1">
      <Text variant="caption" tone="variant">
        Download, last 6 h
      </Text>
      <View aria-hidden>
        <Sparkline points={series.points} colour="viz-1" height={ASIDE_HEIGHT} area />
      </View>
    </View>
  );
}

function RunButton({
  hero,
  running,
  test,
}: {
  readonly hero: HeroModel;
  readonly running: boolean;
  readonly test: SpeedTestControls;
}): ReactNode {
  if (!hero.canRun) {
    return null;
  }
  return (
    <Button
      label={running ? 'Testing…' : 'Run speed test'}
      variant="tonal"
      icon={running ? 'loader' : 'play'}
      onPress={running ? test.show : test.start}
    />
  );
}

export function RouterHero({ device }: { readonly device: Device }): ReactNode {
  const stream = useRouterSnapshot();
  const run = useSpeedTestRun();
  const tests = useSpeedTests();
  const test = useSpeedTestControls();
  if (stream.state === 'waiting') {
    return <ServiceHeroSkeleton />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const { value } = stream;
  if (value.connection.state === 'not_set_up') {
    return null;
  }
  const last = tests.state === 'ready' ? (tests.tests[0] ?? null) : null;
  const hero = heroOf(value, last);
  const showAside = !hero.stale && hero.tone !== 'critical';
  return (
    <>
      <ServiceHero
        medallion={
          <ServiceMedallion
            glyph="router"
            tone={hero.tone}
            ratio={hero.ratio}
            live={run.running}
            size="hero"
            label={hero.spoken}
            offline={hero.stale}
          />
        }
        state={{ title: hero.title, tone: hero.tone }}
        figures={hero.figures}
        facts={hero.facts}
        stale={hero.stale}
        actions={<RunButton hero={hero} running={run.running} test={test} />}
        {...(hero.ringNote === undefined ? {} : { ringNote: hero.ringNote })}
        {...(showAside ? { aside: <HeroAside device={device} /> } : {})}
      />
      <SpeedTestSheet open={test.open} onClose={test.close} />
    </>
  );
}
