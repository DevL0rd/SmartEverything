import { usePluginScreen } from '../shared/plugin-log';
import type { SpeedTestResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../components/banner';
import { Sheet } from '../../components/sheet';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { PluginButton } from '../shared/plugin-action';
import { LastResult, SpeedHistory } from './overview/speed-history';
import { SpeedGauge, SpeedSteps } from './overview/speed-gauge';
import {
  useRouterTools,
  useSpeedTestRun,
  useSpeedTests,
  type SpeedTestList,
  type SpeedTestRun,
} from './router-data';

function buttonLabel(run: SpeedTestRun): string {
  if (run.running) {
    return 'Testing…';
  }
  if (run.failed) {
    return 'Try again';
  }
  return run.phase === 'done' ? 'Run again' : 'Run speed test';
}

function Body({
  list,
  last,
}: {
  readonly list: SpeedTestList;
  readonly last: SpeedTestResult | null;
}): ReactNode {
  usePluginScreen('router', 'SpeedTestSheet');
  if (list.state === 'loading') {
    return <Skeleton shape="block" />;
  }
  if (list.state === 'failed') {
    return <Banner tone="critical" title={list.reason} />;
  }
  return (
    <>
      {last === null ? null : <LastResult test={last} />}
      <SpeedHistory tests={list.tests} />
    </>
  );
}

export function SpeedTestSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const tools = useRouterTools();
  const run = useSpeedTestRun();
  const list = useSpeedTests();
  const last = list.state === 'ready' ? (list.tests[0] ?? null) : null;
  return (
    <Sheet open={open} onClose={onClose} title="Speed test" scroll>
      <View className="gap-section-gap">
        <SpeedGauge run={run} last={last} />
        <View accessibilityLiveRegion="polite" className="items-center">
          <Text variant="footnote" tone="variant">
            {run.failed ? '' : (run.line ?? '')}
          </Text>
        </View>
        {run.failed ? (
          <Banner
            tone="critical"
            title="The speed test failed"
            wrapBody
            {...(run.reason === null ? {} : { body: run.reason })}
          />
        ) : (
          <SpeedSteps run={run} />
        )}
        <View className="gap-1.5">
          <PluginButton
            label={buttonLabel(run)}
            variant="filled"
            size="lg"
            loading={run.running}
            disabled={run.running}
            onPress={() => tools.run('run_speed_test', {}, 'The speed test didn’t start')}
          />
          {last === null ? null : (
            <Text variant="footnote" tone="variant" align="center">
              {last.server}
            </Text>
          )}
        </View>
        <Body list={list} last={last} />
      </View>
    </Sheet>
  );
}
