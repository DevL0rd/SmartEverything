import { formatByteRate, type SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { bytes } from '../../format/number';
import { joinParts, plural } from '../../format/text';
import { duration } from '../../format/time';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import {
  SYNC_STATE_TEXT,
  syncthingNotice,
  useSyncthingSnapshot,
  useSyncthingTools,
} from './syncthing-data';
import { Invitations } from './invitations';

function Health({ snapshot }: { readonly snapshot: SyncthingSnapshot }): ReactNode {
  const tools = useSyncthingTools();
  const { summary } = snapshot;
  const state = SYNC_STATE_TEXT[summary.state];
  const paused = summary.state === 'paused';
  return (
    <Card title="Syncthing" icon="folderSync">
      <Text variant="title-2" tone={state.tone}>
        {state.title}
      </Text>
      <Text variant="footnote" tone="variant">
        {joinParts([
          summary.needBytes > 0 ? `${bytes(summary.needBytes)} left` : null,
          `${String(summary.peersOnline)} of ${plural(summary.peersTotal, 'device')} connected`,
          snapshot.ratesLive
            ? `↓ ${formatByteRate(summary.downloadBytesPerSecond)} ↑ ${formatByteRate(summary.uploadBytesPerSecond)}`
            : null,
        ])}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={paused ? 'Resume all' : 'Pause all'}
          icon={paused ? 'play' : 'pause'}
          variant="tonal"
          onPress={() =>
            void tools.run('set_paused', {
              command: 'set_paused',
              target: { kind: 'all' },
              paused: !paused,
            })
          }
        />
        <Button
          label="Rescan all"
          icon="refresh"
          variant="tonal"
          onPress={() => void tools.run('rescan', { command: 'rescan', folderId: null })}
        />
      </View>
    </Card>
  );
}

function Attention({ snapshot }: { readonly snapshot: SyncthingSnapshot }): ReactNode {
  if (snapshot.attention.length === 0) {
    return null;
  }
  return (
    <List title="Needs attention">
      {snapshot.attention.map((item) => (
        <ListRow
          key={`${item.kind}:${item.folderId ?? ''}:${item.deviceId ?? ''}:${item.text}`}
          title={item.text}
          icon="warning"
          iconTone={item.kind === 'device_overdue' ? 'warning' : 'critical'}
        />
      ))}
    </List>
  );
}

export function SyncSection(): ReactNode {
  const stream = useSyncthingSnapshot();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const snapshot = stream.value;
  const online = snapshot.connection.state === 'online';
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="syncthing" notice={syncthingNotice(snapshot)} />
      {online ? <Health snapshot={snapshot} /> : null}
      {online ? <Attention snapshot={snapshot} /> : null}
      {online ? <Invitations snapshot={snapshot} /> : null}
      {online && snapshot.version !== null ? (
        <Text variant="footnote" tone="faint">
          {joinParts([
            `Syncthing ${snapshot.version}`,
            snapshot.uptimeSeconds === null
              ? null
              : `running for ${duration(snapshot.uptimeSeconds)}`,
          ])}
        </Text>
      ) : null}
    </View>
  );
}
