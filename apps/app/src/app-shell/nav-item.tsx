import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CountPill, Dot } from '../components/badge';
import { Icon } from '../components/icon';
import { Interactive } from '../components/interactive';
import { Text } from '../components/text';
import { cn } from '../design/cn';
import type { NavEntry } from './nav-model';

type NavLook = 'bar' | 'tile' | 'rail' | 'rail-dense' | 'sidebar' | 'collapsed';

export interface NavItemProps {
  readonly entry: NavEntry;
  readonly look: NavLook;
  readonly onPress: () => void;
  readonly onIntent: () => void;
}

function Indicator({
  entry,
  dense,
}: {
  readonly entry: NavEntry;
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
      <Icon name={entry.route.icon} size={24} tone={entry.active ? 'primary' : 'variant'} />
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

function Stacked({ entry, look }: { readonly entry: NavEntry; readonly look: NavLook }): ReactNode {
  return (
    <View className={look === 'rail-dense' ? 'items-center' : 'items-center gap-1'}>
      <Indicator entry={entry} dense={look === 'rail-dense'} />
      {look === 'collapsed' ? null : (
        <Text variant="caption" tone={entry.active ? 'default' : 'variant'} numberOfLines={1}>
          {entry.route.shortTitle ?? entry.route.title}
        </Text>
      )}
    </View>
  );
}

function Row({ entry }: { readonly entry: NavEntry }): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Icon name={entry.route.icon} size={20} tone={entry.active ? 'primary' : 'variant'} />
      <Text
        variant="label"
        tone={entry.active ? 'primary' : 'default'}
        className="flex-1"
        numberOfLines={1}
      >
        {entry.route.title}
      </Text>
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
  tile: 'h-16 w-full items-center justify-center',
  rail: 'h-16 w-full items-center justify-center',
  'rail-dense': 'h-12 w-full items-center justify-center',
  collapsed: 'h-14 w-full items-center justify-center',
  sidebar: 'h-10 min-h-touch-min justify-center rounded-full px-4',
};

export function navLabelOf(entry: NavEntry): string {
  return entry.count > 0
    ? `${entry.route.title}, ${String(entry.count)} unread`
    : entry.route.title;
}

export function NavItem({ entry, look, onPress, onIntent }: NavItemProps): ReactNode {
  return (
    <View
      onPointerEnter={onIntent}
      className={look === 'bar' ? 'flex-1' : look === 'tile' ? 'w-1/4' : 'w-full'}
    >
      <Interactive
        role={look === 'bar' ? 'tab' : 'link'}
        label={navLabelOf(entry)}
        selected={entry.active}
        onPress={onPress}
        className={cn(FRAME[look], look === 'sidebar' && entry.active && 'bg-primary-container')}
        layerClassName="rounded-full"
      >
        {look === 'sidebar' ? <Row entry={entry} /> : <Stacked entry={entry} look={look} />}
      </Interactive>
    </View>
  );
}
