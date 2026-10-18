import type { ReactNode } from 'react';
import { SyncFace } from './sync-faces';
import { orderedFolders } from '../model/folder-model';
import { staleOf, statusOf } from './sync-model';
import { SyncWidgetFrame } from './sync-widget-frame';

export function SyncWidget(): ReactNode {
  return (
    <SyncWidgetFrame title="Sync" icon="folderSync" accent="viz-1">
      {(ready) => (
        <SyncFace
          ready={ready}
          status={statusOf(ready.snapshot)}
          stale={staleOf(ready.snapshot.connection, ready.now)}
          folders={orderedFolders(ready.snapshot.folders)}
        />
      )}
    </SyncWidgetFrame>
  );
}
