import { formatByteRate, type SyncthingPeer } from '@smarteverything/domain';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { ActionRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { Skeleton } from '../../components/skeleton';
import { bytes, percent } from '../../format/number';
import { moment } from '../../format/time';
import { useMinute } from '../../store/clock';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import { syncthingNotice, useSyncthingSnapshot, useSyncthingTools } from './syncthing-data';

function statusOf(peer: SyncthingPeer, now: number): string {
  if (peer.paused) {
    return 'Paused';
  }
  if (!peer.connected) {
    return peer.lastSeen === null
      ? 'Never connected'
      : `Away · last seen ${moment(peer.lastSeen, now)}`;
  }
  return peer.needBytes > 0 ? `Syncing · ${bytes(peer.needBytes)} left` : 'Connected · up to date';
}

function PeerSheet({
  peer,
  onClose,
}: {
  readonly peer: SyncthingPeer | null;
  readonly onClose: () => void;
}): ReactNode {
  const tools = useSyncthingTools();
  const now = useMinute();
  return (
    <Sheet open={peer !== null} onClose={onClose} title={peer?.name ?? 'Device'} scroll>
      {peer === null ? null : (
        <View className="gap-section-gap">
          <List>
            <ValueRow title="Status" value={statusOf(peer, now)} />
            <ValueRow title="Their copy" value={percent(peer.completionPercent / 100)} />
            {peer.address === null ? null : <ValueRow title="Address" value={peer.address} />}
            {peer.clientVersion === null ? null : (
              <ValueRow title="Version" value={peer.clientVersion} />
            )}
            {peer.connected ? (
              <ValueRow
                title="Transfer"
                value={`↓ ${formatByteRate(peer.inBytesPerSecond)} ↑ ${formatByteRate(peer.outBytesPerSecond)}`}
              />
            ) : null}
            <ValueRow title="Device ID" value={peer.id} />
          </List>
          <List>
            <ActionRow
              title={peer.paused ? 'Resume syncing with it' : 'Pause syncing with it'}
              icon={peer.paused ? 'play' : 'pause'}
              onPress={() =>
                void tools.run('set_paused', {
                  command: 'set_paused',
                  target: { kind: 'device', id: peer.id },
                  paused: !peer.paused,
                })
              }
            />
          </List>
        </View>
      )}
    </Sheet>
  );
}

export function DevicesSection(): ReactNode {
  const stream = useSyncthingSnapshot();
  const params = useLocalSearchParams<{ device?: string }>();
  const [openId, setOpenId] = useState<string | null>(params.device ?? null);
  const now = useMinute();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const snapshot = stream.value;
  const open = snapshot.peers.find((peer) => peer.id === openId) ?? null;
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="syncthing" notice={syncthingNotice(snapshot)} />
      {snapshot.peers.length === 0 ? (
        <EmptyState
          icon="link"
          title="No other devices"
          body="Devices you add in Syncthing show up here."
        />
      ) : (
        <List title="Devices">
          {snapshot.peers.map((peer) => (
            <ListRow
              key={peer.id}
              title={peer.name}
              subtitle={statusOf(peer, now)}
              icon="monitor"
              iconTone={peer.connected ? 'primary' : 'faint'}
              trailing={peer.overdue ? <Badge label="Away too long" tone="warning" /> : null}
              chevron
              onPress={() => {
                setOpenId(peer.id);
              }}
            />
          ))}
        </List>
      )}
      <PeerSheet
        peer={open}
        onClose={() => {
          setOpenId(null);
        }}
      />
    </View>
  );
}
