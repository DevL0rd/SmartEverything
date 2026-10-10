import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { Highlighted, type TextRange } from './highlighted';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { useContextMenu, type MenuItem } from './menu';
import { Text } from './text';
import type { Tone } from './tone';

export interface ListRowProps {
  readonly title: string;
  readonly titleHighlight?: TextRange | null;
  readonly subtitle?: string;
  readonly subtitleTone?: Tone;
  readonly wrapSubtitle?: boolean;
  readonly icon?: IconName;
  readonly iconTone?: Tone;
  readonly leading?: ReactNode;
  readonly value?: string;
  readonly chevron?: boolean;
  readonly trailing?: ReactNode;
  readonly onPress?: () => void;
  readonly href?: Href;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly checked?: boolean;
  readonly role?: 'switch' | 'checkbox';
  readonly contextMenu?: readonly MenuItem[];
  readonly label?: string;
}

function Leading({
  icon,
  tone,
  destructive,
}: {
  readonly icon: IconName;
  readonly tone: Tone;
  readonly destructive: boolean;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      className={cn(
        'items-center justify-center',
        pointer ? 'size-8 rounded-sm' : 'size-10 rounded-full',
        destructive ? 'bg-critical/14' : 'bg-surface-3',
      )}
    >
      <Icon name={icon} size={pointer ? 16 : 20} tone={destructive ? 'critical' : tone} />
    </View>
  );
}

function Trailing({
  value,
  chevron,
  trailing,
}: {
  readonly value: string | undefined;
  readonly chevron: boolean | undefined;
  readonly trailing: ReactNode;
}): ReactNode {
  return (
    <View className="shrink-0 flex-row items-center gap-1">
      {value === undefined ? null : (
        <Text variant="callout" tone="variant" numberOfLines={1} className="max-w-48">
          {value}
        </Text>
      )}
      {trailing}
      {chevron === true ? <Icon name="chevronRight" size={20} tone="faint" /> : null}
    </View>
  );
}

function Body({
  title,
  titleHighlight,
  subtitle,
  subtitleTone,
  wrapSubtitle,
  destructive,
}: Pick<
  ListRowProps,
  'title' | 'titleHighlight' | 'subtitle' | 'subtitleTone' | 'wrapSubtitle' | 'destructive'
>): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="body" tone={destructive === true ? 'critical' : 'default'} numberOfLines={2}>
        <Highlighted text={title} range={titleHighlight ?? null} />
      </Text>
      {subtitle === undefined ? null : (
        <Text
          variant="callout"
          tone={subtitleTone ?? 'variant'}
          {...(wrapSubtitle === true ? {} : { numberOfLines: 2 })}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function LeadingSlot({
  icon,
  iconTone,
  leading,
  destructive,
}: {
  readonly leading: ReactNode;
  readonly destructive: boolean | undefined;
  readonly icon: IconName | undefined;
  readonly iconTone: Tone | undefined;
}): ReactNode {
  if (leading !== undefined) {
    return leading;
  }
  return icon === undefined ? null : (
    <Leading icon={icon} tone={iconTone ?? 'variant'} destructive={destructive === true} />
  );
}

function frameOf(props: ListRowProps): string {
  return cn(
    'flex-row items-center gap-4 px-4 py-2',
    props.subtitle === undefined ? 'min-h-row-h' : 'min-h-row-h-2',
    props.selected === true && 'bg-primary-container',
  );
}

export function ListRow(props: ListRowProps): ReactNode {
  const { onPress, href, disabled = false, selected, contextMenu } = props;
  const menu = useContextMenu(contextMenu ?? []);
  const frame = frameOf(props);
  const content = (
    <>
      <LeadingSlot
        icon={props.icon}
        iconTone={props.iconTone}
        leading={props.leading}
        destructive={props.destructive}
      />
      <Body {...props} />
      <Trailing value={props.value} chevron={props.chevron} trailing={props.trailing} />
      {menu.host}
    </>
  );
  if (onPress === undefined && href === undefined && contextMenu === undefined) {
    return <View className={cn(frame, disabled && 'opacity-40')}>{content}</View>;
  }
  return (
    <Interactive
      onPress={onPress}
      onLongPress={menu.onLongPress}
      onContextMenu={menu.onContextMenu}
      href={href}
      disabled={disabled}
      selected={selected}
      checked={props.checked}
      role={props.role}
      label={props.label ?? props.title}
      className={frame}
    >
      {content}
    </Interactive>
  );
}
