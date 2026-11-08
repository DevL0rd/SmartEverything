import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { Dimensions, View, type GestureResponderEvent } from 'react-native';
import { useIdiom } from '../design/platform';
import { useSizeClass } from '../design/size-class';
import { heavyThud } from '../platform/haptics';
import { centredRect, measureAnchor, pointRect, type Rect } from './anchor';
import { BottomSheet } from './bottom-sheet';
import { IconButton } from './icon-button';
import type { Point } from './interactive';
import { LiftMenu, MenuPreview } from './menu-lift';
import { arrangeEntries, MenuRows, QuickRow, type MenuItem } from './menu-rows';
import { useMenuTouchRelease } from './menu-touch-release';
import { Popover } from './popover';
import { useSheetSubpage } from './sheet-navigation';

export type { MenuItem, MenuSubpageNavigation } from './menu-rows';

export interface MenuOptions {
  readonly header?: (close: () => void) => ReactNode;
  readonly quick?: readonly MenuItem[];
  readonly preview?: ReactNode;
  readonly withinSheet?: { readonly opener: RefObject<View | null> };
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
  const header = options.header?.(onClose) ?? null;
  if (quick.length > 0 || options.preview !== undefined || header !== null) {
    return (
      <LiftMenu
        label={label}
        header={header}
        preview={options.preview ?? null}
        quick={quick}
        entries={arrangeEntries([], items)}
        onClose={onClose}
      />
    );
  }
  return (
    <BottomSheet open onClose={onClose} label={label} detents={['fit']} compact>
      <MenuRows entries={arrangeEntries([], items)} close={onClose} layout="compact" subpages />
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
      chrome
      width={touch ? TOUCH_POPOVER_WIDTH : POINTER_WIDTH}
    >
      {options.header?.(onClose) ?? null}
      <MenuRows
        entries={arrangeEntries(options.quick ?? [], items)}
        close={onClose}
        layout={touch ? 'compact' : 'compact-pointer'}
      />
    </Popover>
  );
}

function HostedSheetMenu({
  opener,
  ...props
}: SheetProps & { readonly opener: RefObject<View | null> }): ReactNode {
  const { items, options, label, onClose } = props;
  const quick = options.quick ?? [];
  const hosted = useSheetSubpage(true, {
    title: label,
    onClose,
    opener,
    detents: ['fit'],
    compact: true,
    children: (
      <>
        {options.header?.(onClose) ?? null}
        {options.preview === undefined || options.preview === null ? null : (
          <MenuPreview>{options.preview}</MenuPreview>
        )}
        {quick.length === 0 ? null : <QuickRow items={quick} close={onClose} subpages />}
        <MenuRows entries={arrangeEntries([], items)} close={onClose} layout="compact" subpages />
      </>
    ),
  });
  return hosted ? null : <SheetMenu {...props} />;
}

function OpenMenu(props: MenuProps & { readonly anchor: Rect }): ReactNode {
  const { idiom, split } = useSizeClass();
  const touch = idiom === 'touch';
  if (!touch || split) return <PopoverMenu {...props} touch={touch} />;
  const withinSheet = props.options.withinSheet;
  return withinSheet === undefined ? (
    <SheetMenu {...props} />
  ) : (
    <HostedSheetMenu {...props} opener={withinSheet.opener} />
  );
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
  const captureRelease = useMenuTouchRelease();
  return {
    anchor,
    onLongPress: (event): void => {
      captureRelease(event);
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

interface OpenedMenu {
  readonly rect: Rect;
  readonly late: readonly MenuItem[];
}

const NO_ITEMS: readonly MenuItem[] = [];

export function useAnchoredMenu(
  items: readonly MenuItem[],
  label: string,
  options: MenuOptions = {},
  late: (() => readonly MenuItem[]) | null = null,
): AnchoredMenu {
  const ref = useRef<View>(null);
  const [opened, setOpened] = useState<OpenedMenu | null>(null);
  return {
    ref,
    open: (): void => {
      measureAnchor(ref, (rect) => {
        setOpened({ rect, late: late === null ? NO_ITEMS : late() });
      });
    },
    menu: (
      <Menu
        items={opened === null || opened.late.length === 0 ? items : [...items, ...opened.late]}
        options={options}
        anchor={opened === null ? null : opened.rect}
        label={label}
        onClose={() => {
          setOpened(null);
        }}
      />
    ),
  };
}

export function OverflowButton({
  items,
  label = 'More options',
  late = null,
  pressRef,
}: {
  readonly items: readonly MenuItem[];
  readonly label?: string;
  readonly late?: (() => readonly MenuItem[]) | null;
  readonly pressRef?: RefObject<View | null>;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  const { ref, open, menu } = useAnchoredMenu(items, label, {}, late);
  return (
    <View ref={ref} collapsable={false}>
      <IconButton
        ref={pressRef ?? null}
        icon={touch ? 'ellipsisVertical' : 'ellipsis'}
        label={label}
        onPress={open}
      />
      {menu}
    </View>
  );
}
