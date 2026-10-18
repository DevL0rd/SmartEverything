import type { RouterSnapshot, SpeedTestResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Sparkline } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { IconButton } from '../../../components/icon-button';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { milliseconds } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSpeedTestRun, useSpeedTests } from '../router-data';
import { canRunSpeedTest, rateParts } from './hero-model';
import { speedHistory } from './speed-model';
import { useSpeedTestControls } from './use-speed-test';

const SPARK_HEIGHT = 40;
const SPARK_POINTS = 12;

function Result({
  last,
  tests,
}: {
  readonly last: SpeedTestResult;
  readonly tests: readonly SpeedTestResult[];
}): ReactNode {
  const download = rateParts(last.downloadMbps);
  const upload = rateParts(last.uploadMbps);
  const points = speedHistory(tests).download.slice(-SPARK_POINTS);
  return (
    <View className="flex-row items-end gap-4">
      <View className="gap-0.5">
        <Text variant="caption" tone="variant">
          Download
        </Text>
        <Figure value={download.value} unit={download.unit} size="m" />
      </View>
      <View className="gap-0.5">
        <Text variant="caption" tone="variant">
          Upload
        </Text>
        <Figure value={upload.value} unit={upload.unit} size="m" />
      </View>
      {points.length < 2 ? null : (
        <View aria-hidden className="min-w-16 flex-1">
          <Sparkline points={points} colour="viz-1" height={SPARK_HEIGHT} area />
        </View>
      )}
    </View>
  );
}

function subtitleOf(last: SpeedTestResult | null, now: number): string {
  if (last === null) {
    return 'No speed tests yet. A test takes about 20 seconds.';
  }
  return joinParts([moment(last.at, now), milliseconds(last.pingMs), last.server]);
}

export function SpeedCard({ snapshot }: { readonly snapshot: RouterSnapshot }): ReactNode {
  const run = useSpeedTestRun();
  const list = useSpeedTests();
  const test = useSpeedTestControls();
  const now = useMinute();
  const tests = list.state === 'ready' ? list.tests : [];
  const last = tests[0] ?? null;
  const canRun = canRunSpeedTest(snapshot);
  return (
    <Card label="Speed test">
      <View className="flex-row items-center gap-3">
        <IconWell icon="gauge" colour="viz-1" />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">Speed test</Text>
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {run.running ? (run.line ?? 'Testing…') : subtitleOf(last, now)}
          </Text>
        </View>
        {canRun && !run.running ? (
          <IconButton icon="play" label="Run speed test" variant="tonal" onPress={test.start} />
        ) : null}
      </View>
      {last === null ? null : <Result last={last} tests={tests} />}
      <View className="items-start">
        <Button
          label="History and details"
          variant="text"
          icon="chevronRight"
          onPress={test.show}
        />
      </View>
    </Card>
  );
}
