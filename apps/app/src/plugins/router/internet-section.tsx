import type { RouterSnapshot } from '@smarteverything/domain';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import { Figure } from '../../components/figure';
import { Grid } from '../../components/grid';
import { ActionRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { StatTile } from '../../components/stat-tile';
import { Text } from '../../components/text';
import { decimal, percent } from '../../format/number';
import { duration } from '../../format/time';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import { megabits, milliseconds } from '../shared/rate-format';
import { routerNotice, useRouterSnapshot, useRouterTools } from './router-data';
import { LastSpeedTest, SpeedTestSheet } from './speed-test-sheet';

function Throughput({
  network,
}: {
  readonly network: NonNullable<RouterSnapshot['network']>;
}): ReactNode {
  return (
    <Card title="Internet" icon="globe">
      <View className="flex-row gap-6">
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="caption" tone="variant">
            Download
          </Text>
          <Figure value={decimal(network.downloadMbps, 1)} unit="Mb/s" size="l" />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="caption" tone="variant">
            Upload
          </Text>
          <Figure value={decimal(network.uploadMbps, 1)} unit="Mb/s" size="l" />
        </View>
      </View>
      <Text
        variant="footnote"
        tone={network.wanUp === false ? 'critical' : 'variant'}
        numberOfLines={2}
      >
        {network.wanUp === false
          ? 'The internet connection is down'
          : `Connected${network.publicIp === null ? '' : ` · ${network.publicIp}`}`}
      </Text>
    </Card>
  );
}

function reading(value: number | null | undefined, format: (value: number) => string): string {
  return value === null || value === undefined ? '—' : format(value);
}

function Health({ snapshot }: { readonly snapshot: RouterSnapshot }): ReactNode {
  const { network, system } = snapshot;
  const connected = snapshot.clients.filter((client) => client.connected).length;
  return (
    <Grid minItemWidth={150}>
      <StatTile label="Latency" value={reading(network?.latencyMs, milliseconds)} />
      <StatTile
        label="Packet loss"
        value={reading(network?.packetLossPercent, (loss) => percent(loss / 100, 1))}
        tone={(network?.packetLossPercent ?? 0) > 2 ? 'warning' : 'default'}
      />
      <StatTile label="Devices online" value={String(connected)} />
      <StatTile
        label="Router CPU"
        value={reading(system?.cpuPercent, (load) => percent(load / 100))}
      />
      <StatTile
        label="Router memory"
        value={reading(system?.memoryUsedPercent, (used) => percent(used / 100))}
      />
      <StatTile
        label="Temperature"
        value={reading(system?.temperatureCelsius, (celsius) => `${decimal(celsius)} °C`)}
      />
    </Grid>
  );
}

function RouterInfo({ info }: { readonly info: NonNullable<RouterSnapshot['info']> }): ReactNode {
  return (
    <>
      {info.model === null ? null : <ValueRow title="Model" value={info.model} />}
      {info.firmware === null ? null : <ValueRow title="Firmware" value={info.firmware} />}
      {info.lanIp === null ? null : <ValueRow title="Address" value={info.lanIp} />}
      <ValueRow title="Running for" value={duration(info.uptimeSeconds)} />
    </>
  );
}

function RouterDetails({ snapshot }: { readonly snapshot: RouterSnapshot }): ReactNode {
  const tools = useRouterTools();
  const { info } = snapshot;
  return (
    <List title="Router" footer={cadenceText(snapshot)}>
      {info === null ? null : <RouterInfo info={info} />}
      <ActionRow
        title="Restart Wi-Fi"
        subtitle="Everyone on Wi-Fi drops for about a minute"
        icon="wifi"
        onPress={() => void tools.run('restart_wifi', {})}
      />
      <ActionRow
        title="Restart router"
        subtitle="The whole home is offline for a few minutes"
        icon="power"
        destructive
        onPress={() => void tools.run('reboot', {})}
      />
    </List>
  );
}

function cadenceText(snapshot: RouterSnapshot): string {
  if (snapshot.cadence === 'paused' || snapshot.intervalSeconds === null) {
    return 'Monitoring is paused.';
  }
  return snapshot.cadence === 'fast'
    ? `Updates every ${String(snapshot.intervalSeconds)} s while you’re looking.`
    : `Updates every ${String(snapshot.intervalSeconds)} s in the background.`;
}

export function InternetSection(): ReactNode {
  const stream = useRouterSnapshot();
  const params = useLocalSearchParams<{ speedtest?: string }>();
  const [testing, setTesting] = useState(params.speedtest === 'open');
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const snapshot = stream.value;
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="router" notice={routerNotice(snapshot)} />
      {snapshot.network === null ? null : <Throughput network={snapshot.network} />}
      {snapshot.connection.state === 'online' ? <Health snapshot={snapshot} /> : null}
      <LastSpeedTest
        onOpen={() => {
          setTesting(true);
        }}
      />
      {snapshot.connection.state === 'not_set_up' ? null : <RouterDetails snapshot={snapshot} />}
      <SpeedTestSheet
        open={testing}
        onClose={() => {
          setTesting(false);
        }}
      />
      {snapshot.network === null ? null : (
        <Text variant="footnote" tone="faint">
          {`Wired and Wi-Fi traffic inside the home: ${megabits(snapshot.network.lanDownloadMbps)} in, ${megabits(snapshot.network.lanUploadMbps)} out`}
        </Text>
      )}
    </View>
  );
}
