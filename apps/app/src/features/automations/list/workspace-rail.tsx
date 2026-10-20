import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { WorkspaceLink } from './list-links';

export interface WorkspaceRailProps {
  readonly links: readonly WorkspaceLink[];
  readonly extras: readonly WorkspaceLink[];
  readonly active: string;
  readonly orientation: 'row' | 'column';
}

function Entry({
  link,
  active,
  column,
}: {
  readonly link: WorkspaceLink;
  readonly active: boolean;
  readonly column: boolean;
}): ReactNode {
  return (
    <Interactive
      href={link.href}
      role="tab"
      label={link.label}
      selected={active}
      className={cn(
        'min-h-touch-min flex-row items-center gap-2 px-3',
        column ? 'rounded-md' : 'rounded-full border-hairline',
        active ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
      layerClassName={column ? 'rounded-md' : 'rounded-full'}
    >
      <Icon name={link.icon} size={16} tone={active ? 'primary' : 'variant'} />
      <Text variant="label" tone={active ? 'primary' : 'default'} numberOfLines={1}>
        {link.label}
      </Text>
    </Interactive>
  );
}

export function WorkspaceRail({
  links,
  extras,
  active,
  orientation,
}: WorkspaceRailProps): ReactNode {
  const column = orientation === 'column';
  const entries = [...links, ...extras];
  if (column) {
    return (
      <View accessibilityRole="tablist" className="gap-1">
        {entries.map((link) => (
          <Entry key={link.id} link={link} active={link.id === active} column />
        ))}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerClassName="gap-2"
    >
      {entries.map((link) => (
        <Entry key={link.id} link={link} active={link.id === active} column={false} />
      ))}
    </ScrollView>
  );
}
