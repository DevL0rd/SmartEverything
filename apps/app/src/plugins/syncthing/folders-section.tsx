import { usePluginScreen } from '../shared/plugin-log';
import type { ReactNode } from 'react';
import { EmptyState } from '../../components/empty-state';
import { List } from '../../components/section';
import type { Device } from '../../store/state';
import { useSectionParam } from '../../components/use-section-param';
import { PluginStreamSection } from '../shared/plugin-stream-section';
import { FolderRow } from './model/folder-row';
import { FolderSheet } from './model/folder-sheet';
import { orderedFolders } from './model/folder-model';
import { syncSectionHref } from './model/links';
import { syncthingNotice, useSyncthingSnapshot } from './syncthing-data';

export function FoldersSection({ device }: { readonly device: Device }): ReactNode {
  usePluginScreen('syncthing', 'FoldersSection');
  const [openId, open, close] = useSectionParam('folder');
  return (
    <PluginStreamSection
      stream={useSyncthingSnapshot()}
      pluginId="syncthing"
      notice={syncthingNotice}
    >
      {(snapshot) => (
        <>
          {snapshot.folders.length === 0 ? (
            <EmptyState
              icon="folder"
              title="No synced folders"
              body="Folders you share in Syncthing show up here."
            />
          ) : (
            <List>
              {orderedFolders(snapshot.folders).map((folder) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  onPress={() => {
                    open(folder.id);
                  }}
                />
              ))}
            </List>
          )}
          <FolderSheet
            folder={snapshot.folders.find((folder) => folder.id === openId) ?? null}
            snapshot={snapshot}
            deviceHref={(id) => syncSectionHref(device.id, 'devices', { device: id })}
            onClose={close}
          />
        </>
      )}
    </PluginStreamSection>
  );
}
