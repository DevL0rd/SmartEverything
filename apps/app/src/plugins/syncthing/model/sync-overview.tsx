import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Skeleton } from '../../../components/skeleton';
import type { Device } from '../../../store/state';
import { Invitations } from '../invitations';
import { useSyncthingSnapshot } from '../syncthing-data';
import { AttentionList } from './attention-list';
import { SyncFooter } from './sync-footer';
import { DevicesPreview, FoldersPreview } from './sync-previews';
import { ThisComputer } from './this-computer';
import { TransferCard } from './transfer-card';

export function SyncOverview({ device }: { readonly device: Device }): ReactNode {
  const stream = useSyncthingSnapshot();
  if (stream.state === 'waiting') {
    return <Skeleton shape="tile" />;
  }
  if (stream.state === 'invalid' || stream.value.connection.state === 'not_set_up') {
    return null;
  }
  const snapshot = stream.value;
  const live = snapshot.connection.state === 'online';
  return (
    <View className="gap-section-gap">
      {live ? <AttentionList snapshot={snapshot} deviceId={device.id} /> : null}
      {live ? <Invitations snapshot={snapshot} /> : null}
      <FoldersPreview snapshot={snapshot} deviceId={device.id} />
      <DevicesPreview snapshot={snapshot} deviceId={device.id} stale={!live} />
      {live ? <TransferCard device={device} snapshot={snapshot} /> : null}
      <ThisComputer snapshot={snapshot} />
      {live ? <SyncFooter snapshot={snapshot} /> : null}
    </View>
  );
}
