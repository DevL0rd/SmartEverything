import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { useFolderHiding } from './data';
import { FolderCover } from './folder-cover';
import { backedUpShare, countLineOf, folderParamOf, type FolderView } from './model';

const KIND_ICON: Readonly<Record<FolderView['kind'], IconName>> = {
  phone: 'smartphone',
  computer: 'monitor',
  drive: 'folder',
};

export function HiddenBadge(): ReactNode {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-surface-3/90 px-2 py-0.5">
      <Icon name="eyeOff" size={12} tone="variant" />
      <Text variant="caption" tone="variant">
        Hidden
      </Text>
    </View>
  );
}

export function useHideAction(): (folder: Pick<FolderView, 'key' | 'name' | 'hidden'>) => void {
  const hide = useFolderHiding();
  return (folder) => {
    background(
      hide({ key: folder.key, name: folder.name, hidden: !folder.hidden }).catch(
        (error: unknown) => {
          notify({
            message: folder.hidden ? 'The folder was not shown' : 'The folder was not hidden',
            error,
            tone: 'critical',
          });
        },
      ),
      'photos.folders.hide_failed',
    );
  };
}

function FolderText({ folder }: { readonly folder: FolderView }): ReactNode {
  const share = backedUpShare(folder);
  return (
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-center gap-1.5">
        <Icon name={KIND_ICON[folder.kind]} size={14} tone="variant" />
        <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
          {folder.name}
        </Text>
      </View>
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {folder.place}
      </Text>
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
        {countLineOf(folder)}
      </Text>
      {share === null ? null : (
        <ProgressBar progress={share} colour="primary" label={`${folder.name} backed up`} />
      )}
    </View>
  );
}

export function FolderCard({ folder }: { readonly folder: FolderView }): ReactNode {
  const toggle = useHideAction();
  return (
    <View
      className={cn(
        'flex-row items-center gap-2 rounded-lg border-hairline border-outline-variant bg-surface-1 p-2',
        folder.hidden && 'opacity-80',
      )}
    >
      <Interactive
        href={href.photosFolder(folderParamOf(folder.key))}
        label={`${folder.name}, ${folder.place}, ${countLineOf(folder)}${folder.hidden ? ', hidden' : ''}`}
        className="min-w-0 flex-1 flex-row items-center gap-3 rounded-md p-1"
        layerClassName="rounded-md"
      >
        <View className="h-18 w-24 overflow-hidden rounded-md">
          <FolderCover cover={folder.cover} className="h-full w-full" />
          {folder.hidden ? (
            <View className="absolute inset-x-1 bottom-1 items-start">
              <HiddenBadge />
            </View>
          ) : null}
        </View>
        <FolderText folder={folder} />
      </Interactive>
      <Button
        label={folder.hidden ? 'Show' : 'Hide'}
        spoken={folder.hidden ? `Show ${folder.name} in Photos` : `Hide ${folder.name} from Photos`}
        icon={folder.hidden ? 'eye' : 'eyeOff'}
        variant={folder.hidden ? 'tonal' : 'text'}
        onPress={() => {
          toggle(folder);
        }}
      />
    </View>
  );
}
