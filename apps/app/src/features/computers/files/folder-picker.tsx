import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { FileEntry } from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { useComputerReach, type ComputerReach } from '../data/computer-scopes';
import { FolderBar } from './folder-bar';
import { FolderFooter, type FolderExtra } from './folder-footer';
import { FolderList, type FolderView } from './folder-list';
import { useFolderBrowse, type FolderBrowse } from './folder-browse';
import { folderView } from './folder-view';
import { breadcrumbs, type PickerMode } from './path-model';

export interface FolderPickerProps {
  readonly deviceId: string;
  readonly mode: PickerMode;
  readonly start?: string | null;
  readonly onChoose?: (path: string) => void;
  readonly onCreateFolder?: (parent: string, name: string) => void;
  readonly onCancel?: () => void;
  readonly compact?: boolean;
}

function FolderBrowser({
  browse,
  reach,
  mode,
  view,
  compact,
}: {
  readonly browse: FolderBrowse;
  readonly reach: ComputerReach;
  readonly mode: PickerMode;
  readonly view: FolderView;
  readonly compact: boolean;
}): ReactNode {
  const { home, here, path, picked, showHidden, pick, go } = browse;
  const open = (entry: FileEntry): void => {
    if (entry.kind === 'folder') {
      go(entry.path);
      return;
    }
    pick(entry.path);
  };
  return (
    <>
      <FolderBar
        crumbs={breadcrumbs(here ?? path ?? home ?? '/', home)}
        machine={reach.name}
        online={reach.online}
        showHidden={showHidden}
        onHidden={browse.setShowHidden}
        onGo={go}
        compact={compact}
      />
      <View
        className={cn('min-h-0 border-t border-outline-variant', compact ? 'shrink' : 'flex-1')}
      >
        <FolderList
          view={view}
          mode={mode}
          showHidden={showHidden}
          picked={picked}
          onOpen={open}
          compact={compact}
        />
      </View>
    </>
  );
}

export function FolderPicker(props: FolderPickerProps): ReactNode {
  const { deviceId, mode, start = null, onChoose, onCreateFolder, compact = false } = props;
  const reach = useComputerReach(deviceId);
  const browse = useFolderBrowse(deviceId, start, reach.online);
  const view = folderView(reach, browse.folder);
  const [extra, setExtra] = useState<FolderExtra>('none');
  const footer = (
    <FolderFooter
      mode={mode}
      machine={reach.name}
      folder={browse.here}
      picked={browse.picked}
      usable={view.kind === 'ready'}
      canCreate={onCreateFolder !== undefined}
      onChoose={(): void => {
        const chosen = mode === 'folder' ? browse.here : browse.picked;
        if (chosen !== null) onChoose?.(chosen);
      }}
      onGo={browse.go}
      onCreate={(parent, name) => {
        onCreateFolder?.(parent, name);
      }}
      onCancel={props.onCancel}
      compact={compact}
      extra={extra}
      onExtra={setExtra}
    />
  );
  if (compact && extra !== 'none') {
    return (
      <ScrollView className="min-h-0 grow-0 shrink" keyboardShouldPersistTaps="handled">
        {footer}
      </ScrollView>
    );
  }
  return (
    <View className={cn('min-h-0', compact ? 'shrink' : 'flex-1')}>
      <FolderBrowser browse={browse} reach={reach} mode={mode} view={view} compact={compact} />
      {footer}
    </View>
  );
}
