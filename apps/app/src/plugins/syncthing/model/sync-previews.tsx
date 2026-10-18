import type { SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { SectionPreview } from '../../shared/section-preview';
import { useMinute } from '../../../store/clock';
import { orderedFolders } from './folder-model';
import { FolderRow } from './folder-row';
import { syncSectionHref } from './links';
import { PeerRow } from './peer-row';

const PREVIEW_FOLDERS = 4;
const PREVIEW_PEERS = 4;

export function FoldersPreview({
  snapshot,
  deviceId,
}: {
  readonly snapshot: SyncthingSnapshot;
  readonly deviceId: string;
}): ReactNode {
  if (snapshot.folders.length === 0) {
    return null;
  }
  return (
    <SectionPreview
      title="Folders"
      total={snapshot.folders.length}
      href={syncSectionHref(deviceId, 'folders')}
    >
      {orderedFolders(snapshot.folders)
        .slice(0, PREVIEW_FOLDERS)
        .map((folder) => (
          <FolderRow
            key={folder.id}
            folder={folder}
            href={syncSectionHref(deviceId, 'folders', { folder: folder.id })}
          />
        ))}
    </SectionPreview>
  );
}

export function DevicesPreview({
  snapshot,
  deviceId,
  stale,
}: {
  readonly snapshot: SyncthingSnapshot;
  readonly deviceId: string;
  readonly stale: boolean;
}): ReactNode {
  const now = useMinute();
  const { summary, peers } = snapshot;
  if (peers.length === 0) {
    return null;
  }
  return (
    <SectionPreview
      title="Synced devices"
      {...(stale
        ? {}
        : { caption: `${String(summary.peersOnline)} of ${String(summary.peersTotal)} connected` })}
      total={peers.length}
      href={syncSectionHref(deviceId, 'devices')}
    >
      {peers.slice(0, PREVIEW_PEERS).map((peer) => (
        <PeerRow
          key={peer.id}
          peer={peer}
          now={now}
          stale={stale}
          href={syncSectionHref(deviceId, 'devices', { device: peer.id })}
        />
      ))}
    </SectionPreview>
  );
}
