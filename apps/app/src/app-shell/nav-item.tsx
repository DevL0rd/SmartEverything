import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CountPill, Dot } from '../components/badge';
import { anchorKey } from '../components/highlight-keys';
import { Icon } from '../components/icon';
import { Interactive, type Point } from '../components/interactive';
import { Text } from '../components/text';
import { useHighlightAnchor } from '../components/use-highlight-anchor';
import { cn } from '../design/cn';
import type { NavEntry } from './nav-model';

type NavFace = Pick<
  NavEntry,
  'key' | 'title' | 'shortTitle' | 'icon' | 'active' | 'badge' | 'count' | 'missing'
>;

type NavLook = 'bar' | 'rail' | 'rail-dense' | 'sidebar' | 'collapsed';

export interface NavItemProps {
  readonly entry: NavFace;
  readonly look: NavLook;
  readonly onPress: () => void;
  readonly onLongPress?: (() => void) | undefined;
  readonly onIntent?: (() => void) | undefined;
  readonly onContextMenu?: ((point: Point) => void) | undefined;
}

function Indicator({
  entry,
  dense,
}: {
  readonly entry: NavFace;
  readonly dense: boolean;
}): ReactNode {
  return (
    <View
      className={cn(
        'items-center justify-center rounded-full',
        dense ? 'h-7 w-14' : 'h-8 w-16',
        entry.active && 'bg-primary-container',
      )}
    >
      <Icon name={entry.icon} size={24} tone={entry.active ? 'primary' : 'variant'} />
      {entry.count > 0 ? (
        <View className="absolute -top-1 right-1">
          <CountPill count={entry.count} />
        </View>
      ) : entry.badge === null ? null : (
        <View className="absolute right-3 top-1">
          <Dot tone="critical" />
        </View>
      )}
    </View>
  );
}

function Stacked({ entry, look }: { readonly entry: NavFace; readonly look: NavLook }): ReactNode {
  return (
    <View className={look === 'rail-dense' ? 'items-center' : 'items-center gap-1'}>
      <Indicator entry={entry} dense={look === 'rail-dense'} />
      {look === 'collapsed' ? null : (
        <Text variant="caption" tone={entry.active ? 'default' : 'variant'} numberOfLines={1}>
          {entry.shortTitle}
        </Text>
      )}
    </View>
  );
}

function Row({ entry }: { readonly entry: NavFace }): ReactNode {
  return (
    <View className={cn('flex-row items-center gap-3', entry.missing && 'opacity-60')}>
      <Icon name={entry.icon} size={20} tone={entry.active ? 'primary' : 'variant'} />
      <Text
        variant="label"
        tone={entry.active ? 'primary' : 'default'}
        className="flex-1"
        numberOfLines={1}
      >
        {entry.title}
      </Text>
      {entry.missing ? (
        <Text variant="caption" tone="faint">
          Not found
        </Text>
      ) : null}
      {entry.count > 0 ? (
        <CountPill count={entry.count} />
      ) : entry.badge === null ? null : (
        <Dot tone="critical" />
      )}
    </View>
  );
}

const FRAME: Readonly<Record<NavLook, string>> = {
  bar: 'h-16 w-full items-center justify-center',
  rail: 'h-16 w-full items-center justify-center',
  'rail-dense': 'h-12 w-full items-center justify-center',
  collapsed: 'h-14 w-full items-center justify-center',
  sidebar: 'h-10 min-h-touch-min justify-center rounded-full px-4',
};

export function navLabelOf(entry: NavFace): string {
  if (entry.missing) return `${entry.title}, not found`;
  return entry.count > 0 ? `${entry.title}, ${String(entry.count)} unread` : entry.title;
}

export function NavItem({
  entry,
  look,
  onPress,
  onLongPress,
  onIntent,
  onContextMenu,
}: NavItemProps): ReactNode {
  const anchor = useHighlightAnchor(anchorKey.nav(entry.key), entry.title);
  return (
    <View {...anchor} onPointerEnter={onIntent} className={look === 'bar' ? 'flex-1' : 'w-full'}>
      <Interactive
        role={look === 'bar' ? 'tab' : 'link'}
        label={navLabelOf(entry)}
        selected={entry.active}
        onPress={onPress}
        onLongPress={onLongPress}
        onContextMenu={onContextMenu}
        className={cn(FRAME[look], look === 'sidebar' && entry.active && 'bg-primary-container')}
        layerClassName="rounded-full"
      >
        {look === 'sidebar' ? <Row entry={entry} /> : <Stacked entry={entry} look={look} />}
      </Interactive>
    </View>
  );
}
