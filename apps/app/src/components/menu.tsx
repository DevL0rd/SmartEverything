import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { heavyThud } from '../platform/haptics';
import { measureAnchor, pointRect, type Rect } from './anchor';
import { BottomSheet } from './bottom-sheet';
import { Icon, type IconName } from './icon';
import { IconButton } from './icon-button';
import { Interactive, type Point } from './interactive';
import { Popover } from './popover';
import { Text } from './text';

export interface MenuItem {
  readonly label: string;
  readonly icon?: IconName;
  readonly onPress: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly shortcut?: string;
}

function MenuRow({
  item,
  close,
  touch,
}: {
  readonly item: MenuItem;
  readonly close: () => void;
  readonly touch: boolean;
}): ReactNode {
  const tone = item.destructive === true ? 'critical' : 'default';
  return (
    <Interactive
      label={item.label}
      disabled={item.disabled}
      role="menuitem"
      onPress={() => {
        close();
        item.onPress();
      }}
      className={cn(
        'flex-row items-center gap-3 px-4',
        touch ? 'min-h-row-h' : 'min-h-9 mx-1 rounded-sm px-3',
      )}
      layerClassName="rounded-sm"
    >
      {item.icon === undefined ? null : (
        <Icon
          name={item.icon}
          size={touch ? 24 : 16}
          tone={item.destructive === true ? 'critical' : 'variant'}
        />
      )}
      <Text variant="body" tone={tone} className="flex-1" numberOfLines={1}>
        {item.label}
      </Text>
      {item.shortcut === undefined || touch ? null : (
        <Text variant="caption" tone="faint">
          {item.shortcut}
        </Text>
      )}
    </Interactive>
  );
}

interface MenuProps {
  readonly items: readonly MenuItem[];
  readonly anchor: Rect | null;
  readonly onClose: () => void;
  readonly label: string;
}

function Menu({ items, anchor, onClose, label }: MenuProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const open = anchor !== null;
  const rows = items.map((item) => (
    <MenuRow key={item.label} item={item} close={onClose} touch={touch} />
  ));
  if (touch) {
    return (
      <BottomSheet open={open} onClose={onClose} label={label} detents={['fit']}>
        <View className="-mx-4">{rows}</View>
      </BottomSheet>
    );
  }
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} label={label} width={240}>
      {rows}
    </Popover>
  );
}

export interface ContextMenu {
  readonly onLongPress: (() => void) | undefined;
  readonly onContextMenu: ((point: Point) => void) | undefined;
  readonly host: ReactNode;
}

export function useContextMenu(items: readonly MenuItem[], label = 'Actions'): ContextMenu {
  const [anchor, setAnchor] = useState<Rect | null>(null);
  if (items.length === 0) {
    return { onLongPress: undefined, onContextMenu: undefined, host: null };
  }
  return {
    onLongPress: (): void => {
      heavyThud();
      setAnchor(pointRect(0, 0));
    },
    onContextMenu: (point): void => {
      setAnchor(pointRect(point.x, point.y));
    },
    host: (
      <Menu
        items={items}
        anchor={anchor}
        label={label}
        onClose={() => {
          setAnchor(null);
        }}
      />
    ),
  };
}

interface AnchoredMenu {
  readonly ref: RefObject<View | null>;
  readonly open: () => void;
  readonly menu: ReactNode;
}

export function useAnchoredMenu(items: readonly MenuItem[], label: string): AnchoredMenu {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  return {
    ref,
    open: (): void => {
      measureAnchor(ref, setAnchor);
    },
    menu: (
      <Menu
        items={items}
        anchor={anchor}
        label={label}
        onClose={() => {
          setAnchor(null);
        }}
      />
    ),
  };
}

export function OverflowButton({
  items,
  label = 'More options',
}: {
  readonly items: readonly MenuItem[];
  readonly label?: string;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  const { ref, open, menu } = useAnchoredMenu(items, label);
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon={touch ? 'ellipsisVertical' : 'ellipsis'} label={label} onPress={open} />
      {menu}
    </View>
  );
}
