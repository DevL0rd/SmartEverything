import { usePluginScreen } from '../shared/plugin-log';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Device } from '../../store/state';
import { PluginStreamSection } from '../shared/plugin-stream-section';
import { Invitations } from './invitations';
import { AttentionList } from './model/attention-list';
import { SyncFooter } from './model/sync-footer';
import { SyncHeroCard } from './model/sync-hero';
import { ThisComputer } from './model/this-computer';
import { TransferCard } from './model/transfer-card';
import { syncthingNotice, useSyncthingSnapshot } from './syncthing-data';

export function SyncSection({
  device,
  beside,
}: {
  readonly device: Device;
  readonly beside: boolean;
}): ReactNode {
  usePluginScreen('syncthing', 'SyncSection');
  return (
    <PluginStreamSection
      stream={useSyncthingSnapshot()}
      pluginId="syncthing"
      notice={syncthingNotice}
    >
      {(snapshot) => (
        <View className="gap-section-gap">
          {beside ? null : <SyncHeroCard />}
          {snapshot.connection.state === 'online' ? (
            <>
              <AttentionList snapshot={snapshot} deviceId={device.id} />
              <Invitations snapshot={snapshot} />
              <TransferCard device={device} snapshot={snapshot} />
              <ThisComputer snapshot={snapshot} />
              <SyncFooter snapshot={snapshot} />
            </>
          ) : null}
        </View>
      )}
    </PluginStreamSection>
  );
}
