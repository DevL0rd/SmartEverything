import { usePluginScreen } from '../shared/plugin-log';
import type { ReactNode } from 'react';
import { EmptyState } from '../../components/empty-state';
import { List } from '../../components/section';
import { useMinute } from '../../store/clock';
import { PeerRow } from './model/peer-row';
import { PeerSheet } from './model/peer-sheet';
import { PluginStreamSection } from '../shared/plugin-stream-section';
import { useSectionParam } from '../../components/use-section-param';
import { syncthingNotice, useSyncthingSnapshot } from './syncthing-data';

export function DevicesSection(): ReactNode {
  usePluginScreen('syncthing', 'DevicesSection');
  const [openId, open, close] = useSectionParam('device');
  const now = useMinute();
  return (
    <PluginStreamSection
      stream={useSyncthingSnapshot()}
      pluginId="syncthing"
      notice={syncthingNotice}
    >
      {(snapshot) => (
        <>
          {snapshot.peers.length === 0 ? (
            <EmptyState
              icon="link"
              title="No other devices"
              body="Devices you add in Syncthing show up here."
            />
          ) : (
            <List>
              {snapshot.peers.map((peer) => (
                <PeerRow
                  key={peer.id}
                  peer={peer}
                  now={now}
                  stale={snapshot.connection.state !== 'online'}
                  onPress={() => {
                    open(peer.id);
                  }}
                />
              ))}
            </List>
          )}
          <PeerSheet
            peer={snapshot.peers.find((peer) => peer.id === openId) ?? null}
            snapshot={snapshot}
            onClose={close}
          />
        </>
      )}
    </PluginStreamSection>
  );
}
