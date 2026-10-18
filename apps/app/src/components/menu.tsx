import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { Dimensions, View, type GestureResponderEvent } from 'react-native';
import { useSizeClass } from '../design/size-class';
import { heavyThud } from '../platform/haptics';
import { centredRect, measureAnchor, pointRect, type Rect } from './anchor';
import { BottomSheet } from './bottom-sheet';
import { IconButton } from './icon-button';
import type { Point } from './interactive';
import { LiftMenu, type PreviewAlign } from './menu-lift';
import { arrangeEntries, MenuRows, type MenuItem } from './menu-rows';
import { Popover } from './popover';
import { useIdiom } from '../design/platform';

export type { MenuItem } from './menu-rows';

export interface MenuOptions {
  readonly quick?: readonly MenuItem[];
  readonly preview?: ReactNode;
  readonly previewAlign?: PreviewAlign;
}

const POINTER_WIDTH = 240;
const TOUCH_POPOVER_WIDTH = 300;

interface MenuProps {
  readonly items: readonly MenuItem[];
  readonly options: MenuOptions;
  readonly anchor: Rect | null;
  readonly onClose: () => void;
  readonly label: string;
}

type SheetProps = Omit<MenuProps, 'anchor'>;

function SheetMenu({ items, options, onClose, label }: SheetProps): ReactNode {
  const quick = options.quick ?? [];
  if (quick.length > 0 || options.preview !== undefined) {
    return (
      <LiftMenu
        label={label}
        preview={options.preview ?? null}
        previewAlign={options.previewAlign ?? 'start'}
        quick={quick}
        entries={arrangeEntries([], items)}
        onClose={onClose}
      />
    );
  }
  return (
    <BottomSheet open onClose={onClose} label={label} detents={['fit']}>
      <View className="-mx-4">
        <MenuRows entries={arrangeEntries([], items)} close={onClose} layout="sheet" />
      </View>
    </BottomSheet>
  );
}

function PopoverMenu({
  items,
  options,
  anchor,
  onClose,
  label,
  touch,
}: MenuProps & { readonly anchor: Rect; readonly touch: boolean }): ReactNode {
  return (
    <Popover
      open
      onClose={onClose}
      anchor={anchor}
      label={label}
      width={touch ? TOUCH_POPOVER_WIDTH : POINTER_WIDTH}
    >
      <MenuRows
        entries={arrangeEntries(options.quick ?? [], items)}
        close={onClose}
        layout={touch ? 'touch-popover' : 'popover'}
      />
    </Popover>
  );
}

function OpenMenu(props: MenuProps & { readonly anchor: Rect }): ReactNode {
  const { idiom, split } = useSizeClass();
  const touch = idiom === 'touch';
  return touch && !split ? <SheetMenu {...props} /> : <PopoverMenu {...props} touch={touch} />;
}

export function Menu(props: MenuProps): ReactNode {
  const { anchor } = props;
  return anchor === null ? null : <OpenMenu {...props} anchor={anchor} />;
}

export interface ContextMenu {
  readonly onLongPress: ((event?: GestureResponderEvent) => void) | undefined;
  readonly onContextMenu: ((point: Point) => void) | undefined;
  readonly host: ReactNode;
}

function pressAnchor(event: GestureResponderEvent | undefined): Rect {
  return event === undefined
    ? centredRect(Dimensions.get('window'))
    : pointRect(event.nativeEvent.pageX, event.nativeEvent.pageY);
}

export interface MenuTrigger {
  readonly anchor: Rect | null;
  readonly onLongPress: (event?: GestureResponderEvent) => void;
  readonly onContextMenu: (point: Point) => void;
  readonly close: () => void;
}

export function useMenuTrigger(): MenuTrigger {
  const [anchor, setAnchor] = useState<Rect | null>(null);
  return {
    anchor,
    onLongPress: (event): void => {
      heavyThud();
      setAnchor(pressAnchor(event));
    },
    onContextMenu: (point): void => {
      setAnchor(pointRect(point.x, point.y));
    },
    close: (): void => {
      setAnchor(null);
    },
  };
}

export function useContextMenu(
  items: readonly MenuItem[],
  label = 'Actions',
  options: MenuOptions = {},
): ContextMenu {
  const trigger = useMenuTrigger();
  if (items.length === 0) {
    return { onLongPress: undefined, onContextMenu: undefined, host: null };
  }
  return {
    onLongPress: trigger.onLongPress,
    onContextMenu: trigger.onContextMenu,
    host: (
      <Menu
        items={items}
        options={options}
        anchor={trigger.anchor}
        label={label}
        onClose={trigger.close}
      />
    ),
  };
}

interface AnchoredMenu {
  readonly ref: RefObject<View | null>;
  readonly open: () => void;
  readonly menu: ReactNode;
}

export function useAnchoredMenu(
  items: readonly MenuItem[],
  label: string,
  options: MenuOptions = {},
): AnchoredMenu {
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
        options={options}
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
