import type { ReactNode, Ref } from 'react';
import { View } from 'react-native';
import type { AppHref } from './app-href';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import {
  COMPACT_DETAIL_ROW_HEIGHT,
  COMPACT_ROW_FRAME,
  COMPACT_ROW_HEIGHT,
  COMPACT_ROW_ICON_SIZE,
} from './compact-panel';
import { Highlighted, type TextRange } from './highlighted';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { useContextMenu, type MenuItem } from './menu';
import { Text } from './text';
import type { Tone } from './tone';

const PASSIVE = { pointerEvents: 'none', 'aria-hidden': true } as const;

export interface ListRowProps {
  readonly title: string;
  readonly overline?: string;
  readonly titleHighlight?: TextRange | null;
  readonly wrapTitle?: boolean;
  readonly subtitle?: string;
  readonly caption?: string;
  readonly subtitleTone?: Tone;
  readonly wrapSubtitle?: boolean;
  readonly icon?: IconName;
  readonly iconTone?: Tone;
  readonly leading?: ReactNode;
  readonly value?: string;
  readonly chevron?: boolean;
  readonly trailing?: ReactNode;
  readonly onPress?: () => void;
  readonly href?: AppHref;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly checked?: boolean;
  readonly expanded?: boolean;
  readonly role?: 'switch' | 'checkbox';
  readonly contextMenu?: readonly MenuItem[];
  readonly label?: string;
  readonly compact?: boolean;
  readonly pressRef?: Ref<View>;
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
  passive,
  compact,
}: {
  readonly value: string | undefined;
  readonly chevron: boolean | undefined;
  readonly trailing: ReactNode;
  readonly passive: boolean;
  readonly compact: boolean;
}): ReactNode {
  return (
    <View
      className="ml-auto shrink-0 flex-row items-center gap-1"
      {...(passive ? { pointerEvents: 'box-none' } : {})}
    >
      {value === undefined ? null : (
        <View className="min-w-0 max-w-48 shrink" {...(passive ? PASSIVE : {})}>
          <Text variant="callout" tone="variant" {...(compact ? {} : { numberOfLines: 1 })}>
            {value}
          </Text>
        </View>
      )}
      {trailing}
      {chevron !== true ? null : passive ? (
        <View {...PASSIVE}>
          <Icon name="chevronRight" size={20} tone="faint" />
        </View>
      ) : (
        <Icon name="chevronRight" size={20} tone="faint" />
      )}
    </View>
  );
}

type BodyProps = { readonly passive: boolean; readonly canShrink: boolean } & Pick<
  ListRowProps,
  | 'title'
  | 'overline'
  | 'titleHighlight'
  | 'wrapTitle'
  | 'subtitle'
  | 'subtitleTone'
  | 'caption'
  | 'wrapSubtitle'
  | 'destructive'
  | 'compact'
>;

function BodySubtitle({ subtitle, subtitleTone, compact, wrapSubtitle }: BodyProps): ReactNode {
  if (subtitle === undefined) return null;
  return (
    <Text
      variant="callout"
      tone={subtitleTone ?? 'variant'}
      {...(compact === true || wrapSubtitle === true ? {} : { numberOfLines: 2 })}
    >
      {subtitle}
    </Text>
  );
}

function Body(props: BodyProps): ReactNode {
  const { title, overline, titleHighlight, caption, destructive, passive, compact } = props;
  const wrapTitle = compact === true || props.wrapTitle === true;
  return (
    <View
      className={cn('flex-1 gap-0.5', wrapTitle || props.canShrink ? 'min-w-0' : 'min-w-40')}
      {...(passive ? PASSIVE : {})}
    >
      {overline === undefined ? null : (
        <Text variant="caption" tone="variant">
          {overline}
        </Text>
      )}
      <Text
        variant="body"
        tone={destructive === true ? 'critical' : 'default'}
        {...(wrapTitle ? {} : { numberOfLines: 2 })}
        {...(props.wrapTitle === true ? { className: 'web:wrap-anywhere' } : {})}
      >
        <Highlighted text={title} range={titleHighlight ?? null} />
      </Text>
      <BodySubtitle {...props} />
      {caption === undefined ? null : (
        <Text variant="caption" tone="variant" numberOfLines={2}>
          {caption}
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
  compact,
}: {
  readonly leading: ReactNode;
  readonly destructive: boolean | undefined;
  readonly icon: IconName | undefined;
  readonly iconTone: Tone | undefined;
  readonly compact: boolean;
}): ReactNode {
  if (leading !== undefined) {
    return leading;
  }
  if (icon === undefined) return null;
  const tone = destructive === true ? 'critical' : (iconTone ?? 'variant');
  return compact ? (
    <Icon name={icon} size={COMPACT_ROW_ICON_SIZE} tone={tone} />
  ) : (
    <Leading icon={icon} tone={tone} destructive={destructive === true} />
  );
}

function frameOf(props: ListRowProps): string {
  const twoLines = props.subtitle !== undefined || props.overline !== undefined;
  if (props.compact === true) {
    return cn(
      COMPACT_ROW_FRAME,
      'rounded-sm py-1',
      twoLines ? COMPACT_DETAIL_ROW_HEIGHT : COMPACT_ROW_HEIGHT,
      props.selected === true && 'bg-primary-container',
    );
  }
  return cn(
    'flex-row flex-wrap content-center items-center gap-x-4 gap-y-2 px-4 py-2',
    props.subtitle === undefined ? 'min-h-row-h' : 'min-h-row-h-2',
    props.selected === true && 'bg-primary-container',
  );
}

function RowLead({
  row,
  passive,
}: {
  readonly row: ListRowProps;
  readonly passive: boolean;
}): ReactNode {
  const slot = (
    <LeadingSlot
      icon={row.icon}
      iconTone={row.iconTone}
      leading={row.leading}
      destructive={row.destructive}
      compact={row.compact === true}
    />
  );
  const hasSlot = row.leading !== undefined || row.icon !== undefined;
  const canShrink = row.chevron === true && row.trailing === undefined && row.value === undefined;
  return (
    <>
      {passive && hasSlot ? <View {...PASSIVE}>{slot}</View> : slot}
      <Body {...row} passive={passive} canShrink={canShrink} />
    </>
  );
}

function RowTrailing({
  row,
  passive,
}: {
  readonly row: ListRowProps;
  readonly passive: boolean;
}): ReactNode {
  return (
    <Trailing
      value={row.value}
      chevron={row.chevron}
      trailing={row.trailing}
      passive={passive}
      compact={row.compact === true}
    />
  );
}

function PressableRow({
  row,
  underlay,
  pressRef,
}: {
  readonly row: Omit<ListRowProps, 'pressRef'>;
  readonly underlay: boolean;
  readonly pressRef: Ref<View> | undefined;
}): ReactNode {
  const menu = useContextMenu(row.contextMenu ?? []);
  return (
    <Interactive
      ref={pressRef}
      onPress={row.onPress}
      onLongPress={menu.onLongPress}
      onContextMenu={menu.onContextMenu}
      href={row.href}
      disabled={row.disabled ?? false}
      selected={row.selected}
      checked={row.checked}
      expanded={row.expanded}
      role={row.role}
      focusInset={row.compact === true}
      label={row.label ?? row.title}
      className={underlay ? 'absolute inset-0' : frameOf(row)}
    >
      {underlay ? null : <RowLead row={row} passive={false} />}
      {underlay ? null : <RowTrailing row={row} passive={false} />}
      {menu.host}
    </Interactive>
  );
}

export function ListRow({ pressRef, ...props }: ListRowProps): ReactNode {
  const { onPress, href, disabled = false, contextMenu } = props;
  if (onPress === undefined && href === undefined && contextMenu === undefined) {
    return (
      <View className={cn(frameOf(props), disabled && 'opacity-40')}>
        <RowLead row={props} passive={false} />
        <RowTrailing row={props} passive={false} />
      </View>
    );
  }
  if (props.trailing === undefined)
    return <PressableRow row={props} pressRef={pressRef} underlay={false} />;
  return (
    <View className={cn('relative', frameOf(props), disabled && 'opacity-40')}>
      <PressableRow row={props} pressRef={pressRef} underlay />
      <RowLead row={props} passive />
      <RowTrailing row={props} passive />
    </View>
  );
}
