import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FileEntry } from '@smarteverything/domain';
import { useComputerReach } from '../data/computer-scopes';
import { FolderBar } from './folder-bar';
import { FolderFooter } from './folder-footer';
import { FolderList } from './folder-list';
import { useFolderBrowse } from './folder-browse';
import { folderView } from './folder-view';
import { breadcrumbs, type PickerMode } from './path-model';

export interface FolderPickerProps {
  readonly deviceId: string;
  readonly mode: PickerMode;
  readonly start?: string | null;
  readonly onChoose?: (path: string) => void;
  readonly onCreateFolder?: (parent: string, name: string) => void;
  readonly onCancel?: () => void;
}

export function FolderPicker(props: FolderPickerProps): ReactNode {
  const { deviceId, mode, start = null, onChoose, onCreateFolder } = props;
  const reach = useComputerReach(deviceId);
  const browse = useFolderBrowse(deviceId, start, reach.online);
  const { folder, home, here, path, picked, showHidden, pick, go } = browse;
  const view = folderView(reach, folder);
  const open = (entry: FileEntry): void => {
    if (entry.kind === 'folder') {
      go(entry.path);
      return;
    }
    pick(entry.path);
  };
  const choose = (): void => {
    const chosen = mode === 'folder' ? here : picked;
    if (chosen !== null) onChoose?.(chosen);
  };
  return (
    <View className="min-h-0 flex-1">
      <FolderBar
        crumbs={breadcrumbs(here ?? path ?? home ?? '/', home)}
        machine={reach.name}
        online={reach.online}
        showHidden={showHidden}
        onHidden={browse.setShowHidden}
        onGo={go}
      />
      <View className="min-h-0 flex-1 border-t border-outline-variant">
        <FolderList view={view} mode={mode} showHidden={showHidden} picked={picked} onOpen={open} />
      </View>
      <FolderFooter
        mode={mode}
        machine={reach.name}
        folder={here}
        picked={picked}
        usable={view.kind === 'ready'}
        canCreate={onCreateFolder !== undefined}
        onChoose={choose}
        onGo={go}
        onCreate={(parent, name) => {
          onCreateFolder?.(parent, name);
        }}
        onCancel={props.onCancel}
      />
    </View>
  );
}
