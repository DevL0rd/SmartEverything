import {
  formatByteRate,
  type SyncthingPeer,
  type SyncthingSnapshot,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { ValueRow } from '../../../components/rows';
import { List, Section } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { decimal } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { PluginActionRow } from '../../shared/plugin-action';
import { CopyRow } from './copy-row';
import { percentOf } from './completion';
import { FolderRing } from './folder-ring';
import { peerStateWord, peerStatus } from './peer-model';
import { SheetLead } from './sheet-lead';
import { unavailableReason, useSyncActions } from './sync-actions';

const NAME_LIMIT = 28;

function shortName(label: string): string {
  return label.length > NAME_LIMIT ? `${label.slice(0, NAME_LIMIT - 1)}…` : label;
}

function Facts({ peer }: { readonly peer: SyncthingPeer }): ReactNode {
  const now = useMinute();
  return (
    <List>
      <ValueRow title="Status" value={peerStatus(peer, now, false)} />
      {peer.address === null ? null : <ValueRow title="Address" value={peer.address} />}
      {peer.clientVersion === null ? null : <ValueRow title="Version" value={peer.clientVersion} />}
      {peer.connected ? (
        <ValueRow
          title="Transfer"
          value={`↓ ${formatByteRate(peer.inBytesPerSecond)} ↑ ${formatByteRate(peer.outBytesPerSecond)}`}
        />
      ) : null}
      <CopyRow title="Device ID" value={peer.id} />
    </List>
  );
}

function SharedFolders({
  peer,
  snapshot,
}: {
  readonly peer: SyncthingPeer;
  readonly snapshot: SyncthingSnapshot;
}): ReactNode {
  const shared = snapshot.folders.filter((folder) => folder.sharedWith.includes(peer.id));
  if (shared.length === 0) {
    return null;
  }
  return (
    <Section title="Folders shared">
      <View className="flex-row flex-wrap gap-2 px-4">
        {shared.map((folder) => (
          <Badge key={folder.id} label={shortName(folder.label)} />
        ))}
      </View>
    </Section>
  );
}

function Body({
  peer,
  snapshot,
}: {
  readonly peer: SyncthingPeer;
  readonly snapshot: SyncthingSnapshot;
}): ReactNode {
  const actions = useSyncActions();
  const percent = percentOf(peer);
  const reason = unavailableReason(snapshot.connection);
  return (
    <View className="gap-section-gap">
      <SheetLead
        ring={
          <FolderRing
            state={{
              tone: percent === 100 ? 'positive' : 'info',
              glyph: null,
              text: '',
              percent,
            }}
            size={40}
            label={`Their copy ${String(percent)} percent`}
          />
        }
        subtitle={joinParts([peerStateWord(peer), `their copy ${decimal(percent)} %`])}
      />
      <Facts peer={peer} />
      <SharedFolders peer={peer} snapshot={snapshot} />
      <List>
        <PluginActionRow
          title={peer.paused ? 'Resume syncing with it' : 'Pause syncing with it'}
          icon={peer.paused ? 'play' : 'pause'}
          disabled={reason !== null}
          {...(reason === null ? {} : { subtitle: reason })}
          onPress={() => actions.pause({ kind: 'device', id: peer.id }, !peer.paused, null)}
        />
      </List>
    </View>
  );
}

export function PeerSheet({
  peer,
  snapshot,
  onClose,
}: {
  readonly peer: SyncthingPeer | null;
  readonly snapshot: SyncthingSnapshot;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={peer !== null} onClose={onClose} title={peer?.name ?? 'Device'} scroll>
      {peer === null ? null : <Body peer={peer} snapshot={snapshot} />}
    </Sheet>
  );
}
