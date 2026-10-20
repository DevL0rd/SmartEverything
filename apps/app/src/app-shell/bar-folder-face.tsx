import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../components/icon';
import { Text } from '../components/text';
import { cn } from '../design/cn';
import type { NavFolderView } from './nav-model';

const STACKED = 3;

export function folderLabelOf(folder: NavFolderView): string {
  return `${folder.title}, folder of ${String(folder.items.length)}`;
}

function Stack({ folder }: { readonly folder: NavFolderView }): ReactNode {
  return (
    <View className="absolute -bottom-1 right-1 flex-row">
      {folder.items.slice(0, STACKED).map((entry, index) => (
        <View
          key={entry.key}
          className={cn(
            'size-5 items-center justify-center rounded-full border border-chrome bg-surface-3',
            index > 0 && '-ml-2',
          )}
        >
          <Icon name={entry.icon} size={16} tone="variant" />
        </View>
      ))}
    </View>
  );
}

export function BarFolderFace({ folder }: { readonly folder: NavFolderView }): ReactNode {
  return (
    <View className="items-center gap-1">
      <View
        className={cn(
          'h-8 w-16 items-center justify-center rounded-full',
          folder.active && 'bg-primary-container',
        )}
      >
        <Icon name={folder.icon} size={24} tone={folder.active ? 'primary' : 'variant'} />
        <Stack folder={folder} />
      </View>
      <Text variant="caption" tone={folder.active ? 'default' : 'variant'} numberOfLines={1}>
        {folder.title}
      </Text>
    </View>
  );
}
