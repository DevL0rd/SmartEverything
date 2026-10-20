import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CountPill, Dot } from '../components/badge';
import { anchorKey } from '../components/highlight-keys';
import { Icon, type IconName } from '../components/icon';
import { Interactive } from '../components/interactive';
import { Text } from '../components/text';
import { useHighlightAnchor } from '../components/use-highlight-anchor';
import { cn } from '../design/cn';
import type { NavEntry } from './nav-model';
import { navLabelOf } from './nav-item';

export interface NavRowProps {
  readonly entry: NavEntry;
  readonly onPress: () => void;
  readonly onIntent: () => void;
  readonly nested?: boolean;
}

function Trailing({ entry }: { readonly entry: NavEntry }): ReactNode {
  if (entry.missing) {
    return (
      <Text variant="caption" tone="faint">
        Not found
      </Text>
    );
  }
  if (entry.count > 0) return <CountPill count={entry.count} />;
  return entry.badge === null ? null : <Dot tone="critical" />;
}

export function NavRow({ entry, onPress, onIntent, nested = false }: NavRowProps): ReactNode {
  const anchor = useHighlightAnchor(anchorKey.nav(entry.key), entry.title);
  return (
    <View {...anchor} onPointerEnter={onIntent} className={cn(nested && 'pl-6')}>
      <Interactive
        role="link"
        label={navLabelOf(entry)}
        selected={entry.active}
        onPress={onPress}
        className={cn(
          'h-12 flex-row items-center gap-3 rounded-full px-4',
          entry.active && 'bg-primary-container',
          entry.missing && 'opacity-60',
        )}
        layerClassName="rounded-full"
      >
        <Icon name={entry.icon} size={24} tone={entry.active ? 'primary' : 'variant'} />
        <Text
          variant="label"
          tone={entry.active ? 'primary' : 'default'}
          className="flex-1"
          numberOfLines={1}
        >
          {entry.title}
        </Text>
        <Trailing entry={entry} />
      </Interactive>
    </View>
  );
}

export interface DisclosureRowProps {
  readonly icon: IconName;
  readonly title: string;
  readonly summary: string;
  readonly open: boolean;
  readonly active: boolean;
  readonly onPress: () => void;
}

export function DisclosureRow({
  icon,
  title,
  summary,
  open,
  active,
  onPress,
}: DisclosureRowProps): ReactNode {
  return (
    <Interactive
      role="button"
      label={`${title}, folder`}
      hint={summary}
      expanded={open}
      onPress={onPress}
      className={cn(
        'h-12 flex-row items-center gap-3 rounded-full px-4',
        active && !open && 'bg-primary-container',
      )}
      layerClassName="rounded-full"
    >
      <Icon name={icon} size={24} tone={active ? 'primary' : 'variant'} />
      <Text variant="label" className="flex-1" numberOfLines={1}>
        {title}
      </Text>
      <Text variant="caption" tone="faint">
        {summary}
      </Text>
      <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} tone="faint" />
    </Interactive>
  );
}
