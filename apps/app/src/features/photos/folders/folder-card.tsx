import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { ProgressBar } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { FolderBackup } from './backup';
import { FolderCover } from './folder-cover';
import { FolderToggles } from './folder-toggles';
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

function FolderText({ folder }: { readonly folder: FolderView }): ReactNode {
  const share = backedUpShare(folder);
  return (
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-center gap-1.5">
        <View className="shrink-0">
          <Icon name={KIND_ICON[folder.kind]} size={14} tone="variant" />
        </View>
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
      {folder.backupId === null && folder.kind !== 'drive' ? (
        <View className="flex-row items-center gap-1">
          <View className="shrink-0">
            <Icon name="cloud" size={12} tone="variant" />
          </View>
          <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 shrink">
            On the hub
          </Text>
        </View>
      ) : null}
      {share === null ? null : (
        <ProgressBar progress={share} colour="primary" label={`${folder.name} backed up`} />
      )}
    </View>
  );
}

export function FolderCard({
  folder,
  backup,
}: {
  readonly folder: FolderView;
  readonly backup: FolderBackup;
}): ReactNode {
  return (
    <View className="gap-2 rounded-lg border-hairline border-outline-variant bg-surface-1 p-2">
      <Interactive
        href={href.photosFolder(folderParamOf(folder.key))}
        label={`${folder.name}, ${folder.place}, ${countLineOf(folder)}${folder.hidden ? ', hidden' : ''}`}
        className="min-w-0 flex-row items-center gap-3 rounded-md p-1"
        layerClassName="rounded-md"
      >
        <View className="h-18 w-24 overflow-hidden rounded-md">
          <View className={folder.hidden ? 'h-full w-full opacity-60' : 'h-full w-full'}>
            <FolderCover cover={folder.cover} className="h-full w-full" />
          </View>
          {folder.hidden ? (
            <View className="absolute inset-x-1 bottom-1 items-start">
              <HiddenBadge />
            </View>
          ) : null}
        </View>
        <FolderText folder={folder} />
      </Interactive>
      <FolderToggles folder={folder} backup={backup} />
    </View>
  );
}
