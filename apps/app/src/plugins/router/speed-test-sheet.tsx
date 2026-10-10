import type { SpeedTestResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { moment } from '../../format/time';
import { useMinute } from '../../store/clock';
import { megabits, milliseconds } from '../shared/rate-format';
import { useRouterTools, useSpeedTestRun, useSpeedTests, type SpeedTestList } from './router-data';

export function summaryOf(test: SpeedTestResult): string {
  return `↓ ${megabits(test.downloadMbps)} · ↑ ${megabits(test.uploadMbps)} · ${milliseconds(test.pingMs)}`;
}

function History({ list }: { readonly list: SpeedTestList }): ReactNode {
  const now = useMinute();
  if (list.state === 'loading') {
    return <Skeleton shape="block" />;
  }
  if (list.state === 'failed') {
    return (
      <Text variant="callout" tone="critical">
        {list.reason}
      </Text>
    );
  }
  if (list.tests.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        No speed tests yet.
      </Text>
    );
  }
  return (
    <List title="Earlier tests">
      {list.tests.map((test) => (
        <ListRow key={test.id} title={summaryOf(test)} subtitle={moment(test.at, now)} />
      ))}
    </List>
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
  const running = useSpeedTestRun();
  const list = useSpeedTests(running.key);
  return (
    <Sheet open={open} onClose={onClose} title="Speed test" scroll>
      <View className="gap-section-gap">
        <View className="gap-2">
          <Button
            label={running.running ? 'Testing…' : 'Run speed test'}
            icon="gauge"
            loading={running.running}
            disabled={running.running}
            onPress={() => void tools.run('run_speed_test', {})}
          />
          {running.line === null ? null : (
            <Text variant="footnote" tone={running.running ? 'variant' : 'critical'}>
              {running.line}
            </Text>
          )}
        </View>
        <History list={list} />
      </View>
    </Sheet>
  );
}

function lastSubtitle(running: boolean, last: SpeedTestResult | null, now: number): string {
  if (running) {
    return 'Testing now…';
  }
  return last === null ? 'Takes about 20 seconds' : moment(last.at, now);
}

export function LastSpeedTest({ onOpen }: { readonly onOpen: () => void }): ReactNode {
  const running = useSpeedTestRun();
  const list = useSpeedTests(running.key);
  const now = useMinute();
  const last = list.state === 'ready' ? (list.tests[0] ?? null) : null;
  return (
    <List title="Speed test">
      <ListRow
        title={last === null ? 'Run a speed test' : summaryOf(last)}
        subtitle={lastSubtitle(running.running, last, now)}
        icon="gauge"
        chevron
        onPress={onOpen}
      />
    </List>
  );
}
