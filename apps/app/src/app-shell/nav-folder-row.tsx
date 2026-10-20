import type { ReactNode } from 'react';
import { View } from 'react-native';
import { anchorKey } from '../components/highlight-keys';
import { Icon } from '../components/icon';
import { Interactive, type Point } from '../components/interactive';
import { Text } from '../components/text';
import { useHighlightAnchor } from '../components/use-highlight-anchor';
import { cn } from '../design/cn';
import type { NavFolderView } from './nav-model';

export function NavFolderRow({
  folder,
  onToggle,
  onContextMenu,
}: {
  readonly folder: NavFolderView;
  readonly onToggle: () => void;
  readonly onContextMenu: ((point: Point) => void) | undefined;
}): ReactNode {
  const anchor = useHighlightAnchor(anchorKey.nav(folder.key), folder.title);
  const lit = folder.active && !folder.open;
  return (
    <View {...anchor} className="w-full">
      <Interactive
        role="button"
        label={`${folder.title}, folder`}
        expanded={folder.open}
        onPress={onToggle}
        onContextMenu={onContextMenu}
        className={cn(
          'h-10 min-h-touch-min flex-row items-center gap-3 rounded-full px-4',
          lit && 'bg-primary-container',
        )}
        layerClassName="rounded-full"
      >
        <Icon name={folder.icon} size={20} tone={lit ? 'primary' : 'variant'} />
        <Text
          variant="label"
          tone={lit ? 'primary' : 'default'}
          className="flex-1"
          numberOfLines={1}
        >
          {folder.title}
        </Text>
        <Icon name={folder.open ? 'chevronDown' : 'chevronRight'} size={16} tone="faint" />
      </Interactive>
    </View>
  );
}
