import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AccessibilityInfo, I18nManager, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { usePausable } from '../../../design/external-store';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import { useIdiom } from '../../../design/platform';
import { shiftedTabs, type BrowserTab, type BrowserTabId } from './browser-tab-state';
import { useTabStripKeyboard } from './browser-tab-strip-keyboard';
import { TabDrag } from './browser-tab-drag';
const POINTER_TAB_WIDTH = 174;
const TOUCH_TAB_WIDTH = 216;
const DRAG_THRESHOLD = 4;
const LONG_PRESS_MS = 200;
const TAB_ACTIONS = [
  { name: 'earlier', label: 'Move earlier' },
  { name: 'later', label: 'Move later' },
  { name: 'close', label: 'Close tab' },
] as const;
interface TabStripProps {
  readonly tabs: readonly BrowserTab[];
  readonly selectedId: BrowserTabId | null;
  readonly onSelect: (id: BrowserTabId) => void;
  readonly onClose: (id: BrowserTabId) => void;
  readonly onNew: () => void;
  readonly onReorder: (ids: readonly string[]) => void;
}
export function BrowserTabStrip(props: TabStripProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const rtl =
    typeof document === 'undefined' ? I18nManager.isRTL : document.documentElement.dir === 'rtl';
  const width = touch ? TOUCH_TAB_WIDTH : POINTER_TAB_WIDTH;
  const [drag] = useState(() => new TabDrag());
  const snapshot = usePausable(drag.subscribe, drag.read);
  const { reduced } = useMotion();
  const keys = props.tabs.map((tab) => tab.id);
  useEffect(() => {
    drag.configure(keys, { width, rtl }, props.onReorder);
  }, [drag, keys, width, rtl, props.onReorder]);
  useEffect(() => {
    if (props.selectedId !== null) drag.reveal(props.selectedId);
  }, [drag, props.selectedId, width]);
  useEffect(
    () => (): void => {
      drag.dispose();
    },
    [drag],
  );
  const move = (id: string, offset: -1 | 1): void => {
    moveTab(props, id, offset);
  };
  useTabStripKeyboard(props, move, () => {
    drag.drop(false);
  });
  return (
    <View
      nativeID="browser-tab-strip"
      accessibilityRole="tablist"
      accessibilityLabel="Browser tabs"
      className="min-w-0 flex-row border-b border-outline-variant bg-surface-2 pl-1"
    >
      <TabScroll
        {...props}
        drag={drag}
        order={snapshot.order ?? keys}
        dragging={snapshot.id}
        width={width}
        rtl={rtl}
        touch={touch}
        reduced={reduced}
      />
      <IconButton icon="plus" label="New browser tab" onPress={props.onNew} />
    </View>
  );
}
function moveTab(props: TabStripProps, id: string, offset: -1 | 1): void {
  const next = shiftedTabs(
    props.tabs.map((tab) => tab.id),
    id,
    offset,
  );
  props.onReorder(next);
  const tab = props.tabs.find((entry) => entry.id === id);
  if (tab !== undefined)
    AccessibilityInfo.announceForAccessibility(
      `Moved ${tab.title} to position ${String(next.indexOf(id) + 1)} of ${String(next.length)}.`,
    );
}
interface TabProps {
  readonly tab: BrowserTab;
  readonly selected: boolean;
  readonly width: number;
  readonly touch: boolean;
  readonly reduced: boolean;
  readonly dragging: boolean;
  readonly drag: TabDrag;
  readonly onSelect: TabStripProps['onSelect'];
  readonly onClose: TabStripProps['onClose'];
  readonly move: (id: string, offset: -1 | 1) => void;
}
function Tab(props: TabProps): ReactNode {
  const { tab, selected, reduced, drag } = props;
  const pan = props.touch
    ? Gesture.Pan().activateAfterLongPress(LONG_PRESS_MS)
    : Gesture.Pan().minDistance(DRAG_THRESHOLD);
  const gesture = pan
    .onStart((event) => {
      scheduleOnRN(drag.start, tab.id, event.absoluteX);
    })
    .onUpdate((event) => {
      scheduleOnRN(drag.update, event.absoluteX);
    })
    .onFinalize((_event, success) => {
      scheduleOnRN(drag.drop, success);
    });
  const frame = { width: props.width, transform: [{ translateY: props.dragging ? -2 : 0 }] };
  return (
    <Animated.View
      nativeID={`browser-tab-${tab.id}`}
      {...(reduced
        ? {}
        : { layout: LinearTransition.duration(DURATION.short).easing(EASING.standard) })}
      style={frame}
      className={cn('relative flex-row rounded-t-sm', selected ? 'bg-surface-1' : 'bg-surface-2')}
    >
      <GestureDetector gesture={gesture}>
        <View className="min-w-0 flex-1">
          <TabSelect {...props} />
        </View>
      </GestureDetector>
      <IconButton
        icon="close"
        label={`Close ${tab.title}`}
        onPress={() => {
          props.onClose(tab.id);
        }}
      />
      {selected ? (
        <View pointerEvents="none" className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" />
      ) : null}
      {props.dragging ? (
        <View pointerEvents="none" className="absolute bottom-1 left-0 top-1 w-0.5 bg-primary" />
      ) : null}
    </Animated.View>
  );
}
function TabSelect({ tab, selected, touch, drag, onSelect, onClose, move }: TabProps): ReactNode {
  const label = `${tab.title}, ${tab.address === '' ? 'blank page' : tab.address}${tab.problem === null ? '' : `, ${tab.problem}`}`;
  return (
    <Interactive
      role="tab"
      selected={selected}
      label={label}
      {...(touch ? {} : { title: label })}
      hint={touch ? 'Hold and drag to reorder' : 'Drag to reorder'}
      onPress={() => {
        if (!drag.consumePress()) onSelect(tab.id);
      }}
      accessibilityActions={TAB_ACTIONS}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'close') onClose(tab.id);
        else move(tab.id, event.nativeEvent.actionName === 'earlier' ? -1 : 1);
      }}
      className="min-h-touch-min min-w-0 flex-row items-center gap-2 px-2"
      layerClassName="rounded-t-sm"
    >
      <TabSourceIcon tab={tab} selected={selected} />
      <Text
        variant="caption"
        tone={selected ? 'default' : 'variant'}
        numberOfLines={1}
        className="min-w-0 flex-1"
      >
        {tab.title}
      </Text>
    </Interactive>
  );
}

interface TabScrollProps extends TabStripProps {
  readonly rtl: boolean;
  readonly drag: TabDrag;
  readonly order: readonly string[];
  readonly dragging: string | null;
  readonly width: number;
  readonly touch: boolean;
  readonly reduced: boolean;
}
function TabScroll(props: TabScrollProps): ReactNode {
  const { drag, dragging } = props;
  const ref = useRef<View>(null);
  const contentFrame = {
    direction: 'ltr',
    flexDirection: props.rtl ? 'row-reverse' : 'row',
  } as const;
  return (
    <View
      ref={ref}
      className="min-w-0 flex-1"
      onLayout={() => {
        ref.current?.measureInWindow((x, _y, width) => {
          drag.measure(width, x);
        });
      }}
    >
      <ScrollView
        ref={(value) => {
          drag.attach(value);
        }}
        horizontal
        contentContainerStyle={contentFrame}
        showsHorizontalScrollIndicator={false}
        className="min-w-0 flex-1"
        scrollEnabled={dragging === null}
        onScroll={(event) => {
          drag.scrolled(event.nativeEvent.contentOffset.x);
        }}
        scrollEventThrottle={16}
      >
        <TabItems {...props} />
      </ScrollView>
    </View>
  );
}
function TabItems(props: TabScrollProps): ReactNode {
  const { tabs, selectedId, order, width, touch, reduced, dragging, drag, onSelect, onClose } =
    props;
  const move = (id: string, offset: -1 | 1): void => {
    moveTab(props, id, offset);
  };
  return order.map((id) => {
    const tab = tabs.find((entry) => entry.id === id);
    return tab === undefined ? null : (
      <Tab
        key={id}
        tab={tab}
        selected={selectedId === id}
        width={width}
        touch={touch}
        reduced={reduced}
        dragging={dragging === id}
        drag={drag}
        onSelect={onSelect}
        onClose={onClose}
        move={move}
      />
    );
  });
}

function TabSourceIcon({
  tab,
  selected,
}: {
  readonly tab: BrowserTab;
  readonly selected: boolean;
}): ReactNode {
  if (tab.status.loading)
    return <ActivityIndicator size="small" colorClassName="accent-primary" className="size-4" />;
  const name =
    tab.problem !== null
      ? 'alert'
      : tab.source.kind === 'project'
        ? 'fileText'
        : 'globe';
  return (
    <Icon
      name={name}
      size={16}
      tone={tab.problem !== null ? 'warning' : selected ? 'default' : 'variant'}
    />
  );
}
