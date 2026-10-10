import type { AdGuardSnapshot, AdGuardStats, AdGuardStatus } from '@smarteverything/domain';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Bars } from '../../components/charts';
import { Grid } from '../../components/grid';
import { Skeleton } from '../../components/skeleton';
import { StatTile } from '../../components/stat-tile';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { decimal, percent } from '../../format/number';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import { milliseconds } from '../shared/rate-format';
import { adguardNotice, protectionText, useAdGuardSnapshot, useAdGuardTools } from './adguard-data';
import { PauseSheet } from './pause-sheet';
import { periodText } from './stats-period';
import { TopList } from './top-list';

function Protection({ status }: { readonly status: AdGuardStatus }): ReactNode {
  const tools = useAdGuardTools();
  const params = useLocalSearchParams<{ pause?: string }>();
  const [pausing, setPausing] = useState(params.pause === 'open');
  return (
    <Card title="AdGuard Home" icon="shield">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="title-3" tone={status.protection ? 'default' : 'warning'}>
          {protectionText(status)}
        </Text>
        <Switch
          label="Ad blocking"
          value={status.protection}
          onChange={(enabled) => {
            if (enabled) {
              void tools.run('resume_protection', {});
            } else {
              setPausing(true);
            }
          }}
        />
      </View>
      {status.protection ? (
        <Button
          label="Pause…"
          icon="pause"
          variant="tonal"
          onPress={() => {
            setPausing(true);
          }}
        />
      ) : null}
      <PauseSheet
        open={pausing}
        onClose={() => {
          setPausing(false);
        }}
      />
    </Card>
  );
}

function Numbers({ stats }: { readonly stats: AdGuardStats }): ReactNode {
  return (
    <View className="gap-3">
      <Grid minItemWidth={140}>
        <StatTile label="Lookups" value={decimal(stats.queries)} />
        <StatTile
          label="Blocked"
          value={percent(stats.blockedPercent / 100, 1)}
          caption={decimal(stats.blocked)}
        />
        <StatTile label="Answer time" value={milliseconds(stats.averageMs)} />
        <StatTile label="Malware and adult" value={decimal(stats.malware + stats.adult)} />
      </Grid>
      {stats.history.length === 0 ? null : (
        <Bars
          bars={stats.historyBlocked.map((value, index) => ({ key: String(index), value }))}
          colour="critical"
          label={`Blocked lookups, ${periodText(stats)}`}
        />
      )}
    </View>
  );
}

function Online({ snapshot }: { readonly snapshot: AdGuardSnapshot }): ReactNode {
  const { status, stats } = snapshot;
  return (
    <>
      {status === null ? null : <Protection status={status} />}
      {stats === null ? null : (
        <>
          <Numbers stats={stats} />
          <TopList title="Most blocked" entries={stats.topBlocked} limit={10} />
          <TopList title="Most looked up" entries={stats.topQueried} limit={10} />
          <TopList title="Busiest devices" entries={stats.topClients} limit={10} />
        </>
      )}
      {status?.version === null || status === null ? null : (
        <Text variant="footnote" tone="faint">{`AdGuard Home ${status.version}`}</Text>
      )}
    </>
  );
}

export function BlockingSection(): ReactNode {
  const stream = useAdGuardSnapshot();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="adguard" notice={adguardNotice(stream.value)} />
      {stream.value.connection.state === 'online' ? <Online snapshot={stream.value} /> : null}
    </View>
  );
}
