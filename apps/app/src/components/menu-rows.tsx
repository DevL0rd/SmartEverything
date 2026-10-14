import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

export interface MenuItem {
  readonly label: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly onPress: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly shortcut?: string;
}

export type MenuLayout = 'sheet' | 'touch-popover' | 'popover';

const ROW: Readonly<Record<MenuLayout, string>> = {
  sheet: 'min-h-row-h px-4',
  'touch-popover': 'mx-1 min-h-touch-min rounded-sm px-3',
  popover: 'mx-1 min-h-9 rounded-sm px-3',
};

const ICON_SIZE: Readonly<Record<MenuLayout, 16 | 20 | 24>> = {
  sheet: 24,
  'touch-popover': 20,
  popover: 16,
};

export type MenuEntry =
  | { readonly kind: 'item'; readonly item: MenuItem }
  | { readonly kind: 'divider'; readonly key: string };

export function arrangeEntries(
  quick: readonly MenuItem[],
  items: readonly MenuItem[],
): readonly MenuEntry[] {
  const plain = items.filter((item) => item.destructive !== true);
  const destructive = items.filter((item) => item.destructive === true);
  const lead = [...quick, ...plain];
  const entries: MenuEntry[] = lead.map((item) => ({ kind: 'item', item }));
  if (destructive.length > 0 && lead.length > 0) {
    entries.push({ kind: 'divider', key: 'destructive-divider' });
  }
  return [...entries, ...destructive.map((item): MenuEntry => ({ kind: 'item', item }))];
}

function MenuRow({
  item,
  close,
  layout,
}: {
  readonly item: MenuItem;
  readonly close: () => void;
  readonly layout: MenuLayout;
}): ReactNode {
  const critical = item.destructive === true;
  return (
    <Interactive
      label={item.label}
      hint={item.description}
      disabled={item.disabled}
      role="menuitem"
      onPress={() => {
        close();
        item.onPress();
      }}
      className={cn('flex-row items-center gap-3', ROW[layout])}
      layerClassName="rounded-sm"
    >
      {item.icon === undefined ? null : (
        <Icon name={item.icon} size={ICON_SIZE[layout]} tone={critical ? 'critical' : 'variant'} />
      )}
      <MenuItemBody item={item} critical={critical} />
      {item.shortcut === undefined || layout !== 'popover' ? null : (
        <Text variant="caption" tone="faint">
          {item.shortcut}
        </Text>
      )}
    </Interactive>
  );
}

function MenuItemBody({
  item,
  critical,
}: {
  readonly item: MenuItem;
  readonly critical: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5 py-1">
      <Text variant="body" tone={critical ? 'critical' : 'default'} numberOfLines={1}>
        {item.label}
      </Text>
      {item.description === undefined ? null : (
        <Text variant="caption" tone="variant">
          {item.description}
        </Text>
      )}
    </View>
  );
}

export function MenuRows({
  entries,
  close,
  layout,
}: {
  readonly entries: readonly MenuEntry[];
  readonly close: () => void;
  readonly layout: MenuLayout;
}): ReactNode {
  return entries.map((entry) =>
    entry.kind === 'divider' ? (
      <View key={entry.key} className="my-1 h-hairline bg-outline-variant" />
    ) : (
      <MenuRow key={entry.item.label} item={entry.item} close={close} layout={layout} />
    ),
  );
}

function QuickButton({
  item,
  close,
}: {
  readonly item: MenuItem;
  readonly close: () => void;
}): ReactNode {
  return (
    <Interactive
      label={item.label}
      disabled={item.disabled}
      role="menuitem"
      onPress={() => {
        close();
        item.onPress();
      }}
      className="min-h-touch-min flex-1 items-center gap-1 rounded-md px-1 pb-2 pt-2.5"
      layerClassName="rounded-md"
    >
      <View className="size-10 items-center justify-center rounded-full bg-surface-2">
        {item.icon === undefined ? null : (
          <Icon
            name={item.icon}
            size={20}
            tone={item.destructive === true ? 'critical' : 'default'}
          />
        )}
      </View>
      <Text variant="caption" numberOfLines={1}>
        {item.label}
      </Text>
    </Interactive>
  );
}

export function QuickRow({
  items,
  close,
}: {
  readonly items: readonly MenuItem[];
  readonly close: () => void;
}): ReactNode {
  return (
    <>
      <View className="flex-row gap-1 p-2">
        {items.map((item) => (
          <QuickButton key={item.label} item={item} close={close} />
        ))}
      </View>
      <View className="h-hairline bg-outline-variant" />
    </>
  );
}
