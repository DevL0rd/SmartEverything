import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import {
  COMPACT_DETAIL_ROW_HEIGHT,
  COMPACT_ROW_FRAME,
  COMPACT_ROW_HEIGHT,
  COMPACT_ROW_ICON_SIZE,
} from './compact-panel';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

export interface MenuSubpageNavigation {
  readonly back: () => void;
  readonly close: () => void;
  readonly opener: RefObject<View | null>;
}

export interface MenuItem {
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly onPress: () => void;
  readonly subpage?: (navigation: MenuSubpageNavigation) => ReactNode;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly shortcut?: string;
}

type StandardMenuLayout = 'touch-popover' | 'popover';
type MenuLayout = StandardMenuLayout | 'compact' | 'compact-pointer';

const ROW: Readonly<Record<StandardMenuLayout, string>> = {
  'touch-popover': 'mx-1 min-h-touch-min rounded-sm px-3',
  popover: 'mx-1 min-h-9 rounded-sm px-3',
};

const ICON_SIZE: Readonly<Record<StandardMenuLayout, 16 | 20>> = {
  'touch-popover': 20,
  popover: 16,
};

function compactRowClass(item: MenuItem): string {
  return cn(
    'rounded-sm',
    item.description === undefined ? COMPACT_ROW_HEIGHT : COMPACT_DETAIL_ROW_HEIGHT,
  );
}

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

interface MenuControlProps {
  readonly item: MenuItem;
  readonly close: () => void;
  readonly subpages: boolean;
}

function useMenuSubpageActions({
  back,
  close,
}: Pick<MenuSubpageNavigation, 'back' | 'close'>): Pick<MenuSubpageNavigation, 'back' | 'close'> {
  const live = useRef(false);
  useLayoutEffect(() => {
    live.current = true;
    return (): void => {
      live.current = false;
    };
  }, []);
  const finish = (action: () => void): void => {
    if (!live.current) return;
    live.current = false;
    action();
  };
  return {
    back: (): void => {
      finish(back);
    },
    close: (): void => {
      finish(close);
    },
  };
}

function ActiveMenuSubpage({
  render,
  back,
  close,
  opener,
}: MenuSubpageNavigation & {
  readonly render: NonNullable<MenuItem['subpage']>;
}): ReactNode {
  const actions = useMenuSubpageActions({ back, close });
  return render({ opener, ...actions });
}

function useMenuItemPress({ item, close, subpages }: MenuControlProps): {
  readonly ref: RefObject<View | null>;
  readonly onPress: () => void;
  readonly page: ReactNode;
} {
  const [active, setActive] = useState(false);
  const opener = useRef<View>(null);
  const subpage = subpages ? item.subpage : undefined;
  return {
    ref: opener,
    onPress: (): void => {
      if (subpage !== undefined) {
        setActive(true);
        return;
      }
      close();
      item.onPress();
    },
    page:
      active && subpage !== undefined ? (
        <ActiveMenuSubpage
          render={subpage}
          close={close}
          opener={opener}
          back={() => {
            setActive(false);
          }}
        />
      ) : null,
  };
}

function MenuRow({
  item,
  close,
  layout,
  subpages,
}: MenuControlProps & {
  readonly layout: MenuLayout;
}): ReactNode {
  const critical = item.destructive === true;
  const compact = layout === 'compact' || layout === 'compact-pointer';
  const showShortcut = layout === 'popover' || layout === 'compact-pointer';
  const { page, ...press } = useMenuItemPress({ item, close, subpages });
  return (
    <>
      <Interactive
        {...press}
        label={item.label}
        hint={item.description}
        disabled={item.disabled}
        role="menuitem"
        focusInset={compact}
        className={cn(COMPACT_ROW_FRAME, compact ? compactRowClass(item) : ROW[layout])}
        layerClassName="rounded-sm"
      >
        {item.icon === undefined ? null : (
          <Icon
            name={item.icon}
            size={compact ? COMPACT_ROW_ICON_SIZE : ICON_SIZE[layout]}
            tone={critical ? 'critical' : 'variant'}
          />
        )}
        <MenuItemBody item={item} critical={critical} wrap={compact} />
        {item.shortcut === undefined || !showShortcut ? null : (
          <Text variant="caption" tone={compact ? 'variant' : 'faint'}>
            {item.shortcut}
          </Text>
        )}
      </Interactive>
      {page}
    </>
  );
}

function MenuItemBody({
  item,
  critical,
  wrap,
}: {
  readonly item: MenuItem;
  readonly critical: boolean;
  readonly wrap: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5 py-1">
      <Text
        variant="body"
        tone={critical ? 'critical' : 'default'}
        {...(wrap ? {} : { numberOfLines: 1 })}
      >
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
  subpages = false,
}: {
  readonly entries: readonly MenuEntry[];
  readonly close: () => void;
  readonly layout: MenuLayout;
  readonly subpages?: boolean;
}): ReactNode {
  return entries.map((entry) =>
    entry.kind === 'divider' ? (
      <View key={entry.key} className="my-1 h-hairline bg-outline-variant" />
    ) : (
      <MenuRow
        key={entry.item.id ?? entry.item.label}
        item={entry.item}
        close={close}
        layout={layout}
        subpages={subpages}
      />
    ),
  );
}

function QuickButton({ item, close, subpages }: MenuControlProps): ReactNode {
  const { page, ...press } = useMenuItemPress({ item, close, subpages });
  return (
    <>
      <Interactive
        {...press}
        label={item.label}
        disabled={item.disabled}
        role="menuitem"
        className="min-h-touch-min min-w-0 flex-1 items-center gap-1 rounded-md px-1 pb-2 pt-2.5"
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
        <Text variant="caption" className="text-center">
          {item.label}
        </Text>
      </Interactive>
      {page}
    </>
  );
}

export function QuickRow({
  items,
  close,
  subpages,
}: {
  readonly items: readonly MenuItem[];
  readonly close: () => void;
  readonly subpages: boolean;
}): ReactNode {
  return (
    <>
      <View className="flex-row gap-1 p-2">
        {items.map((item) => (
          <QuickButton key={item.id ?? item.label} item={item} close={close} subpages={subpages} />
        ))}
      </View>
      <View className="h-hairline bg-outline-variant" />
    </>
  );
}
