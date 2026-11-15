import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { ProgressBar } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { FolderBackup } from './backup';
import { FolderCover } from './folder-cover';
import { FolderToggles, ShownPill } from './folder-toggles';
import { cn } from '../../../design/cn';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { useAreaWidth } from '../../../design/size-class';
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

function FolderText({
  folder,
  backsUp,
}: {
  readonly folder: FolderView;
  readonly backsUp: boolean;
}): ReactNode {
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
        {countLineOf(folder, backsUp)}
      </Text>
      {share === null || !backsUp ? null : (
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
  const pair = folder.backupId !== null;
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const backsUp = folder.backupId !== null && backup.on(folder.backupId);
  return (
    <View
      className={cn(
        'rounded-lg border-hairline border-outline-variant bg-surface-1 p-2',
        pair ? 'gap-2' : 'flex-row items-center gap-2',
      )}
    >
      <Interactive
        href={href.photosFolder(folderParamOf(folder.key))}
        label={`${folder.name}, ${folder.place}, ${countLineOf(folder, backsUp)}${folder.hidden ? ', hidden' : ''}`}
        className={cn('min-w-0 flex-row items-center gap-3 rounded-md p-1', !pair && 'flex-1')}
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
        <FolderText folder={folder} backsUp={backsUp} />
      </Interactive>
      {pair ? (
        <FolderToggles folder={folder} backup={backup} />
      ) : (
        <ShownPill folder={folder} fill={false} iconOnly={compact} />
      )}
    </View>
  );
}
