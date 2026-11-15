import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { ShellTabs } from '../../../components/page-shell/shell-sections';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import type { WorkspaceLink } from './list-links';

export interface WorkspaceRailProps {
  readonly links: readonly WorkspaceLink[];
  readonly extras: readonly WorkspaceLink[];
  readonly active: string;
}

function Entry({
  link,
  active,
}: {
  readonly link: WorkspaceLink;
  readonly active: boolean;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <Interactive
      href={link.href}
      role="tab"
      label={link.label}
      selected={active}
      focusInset
      className={cn(
        'flex-row items-center gap-2 rounded-sm px-3',
        pointer ? 'min-h-9' : 'min-h-touch-min',
      )}
      layerClassName="rounded-sm"
    >
      {active ? (
        <View
          pointerEvents="none"
          className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary"
        />
      ) : null}
      <Icon name={link.icon} size={16} tone={active ? 'primary' : 'variant'} />
      <Text variant="label" tone={active ? 'primary' : 'variant'} numberOfLines={1}>
        {link.label}
      </Text>
    </Interactive>
  );
}

export function workspaceTabsOf(
  links: readonly WorkspaceLink[],
  extras: readonly WorkspaceLink[],
  active: string,
): ShellTabs {
  return {
    items: [...links, ...extras].map((link) => ({
      key: link.id,
      label: link.label,
      href: link.href,
      icon: link.icon,
    })),
    active,
    label: 'Automation workspace',
  };
}

export function WorkspaceRail({ links, extras, active }: WorkspaceRailProps): ReactNode {
  return (
    <View accessibilityRole="tablist" accessibilityLabel="Automation workspace">
      {[...links, ...extras].map((link) => (
        <Entry key={link.id} link={link} active={link.id === active} />
      ))}
    </View>
  );
}
