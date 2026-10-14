import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { Point } from '../../../components/interactive';
import { useContextMenu } from '../../../components/menu';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import type { MessageActions } from './message-actions';
import { MessageMenu } from './message-menu';
import { SwipeToQuote } from './swipe-quote';

interface ContextEvent {
  readonly preventDefault: () => void;
  readonly nativeEvent: { readonly pageX: number; readonly pageY: number };
}

function contextProps(handler: ((point: Point) => void) | undefined): {
  readonly onContextMenu?: (event: ContextEvent) => void;
} {
  if (handler === undefined) {
    return {};
  }
  return {
    onContextMenu: (event: ContextEvent): void => {
      event.preventDefault();
      handler({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    },
  };
}

interface FrameProps {
  readonly actions: MessageActions;
  readonly preview: ReactNode;
  readonly align: 'start' | 'end';
  readonly bar: ReactNode;
  readonly swipeable: boolean;
  readonly swipeEnabled?: boolean;
  readonly onQuote: () => void;
  readonly children: ReactNode;
}

function MessageContent({
  children,
  bar,
  align,
  pointer,
  quotable,
  onQuote,
  swipeEnabled,
}: Pick<FrameProps, 'children' | 'bar' | 'align' | 'onQuote'> & {
  readonly pointer: boolean;
  readonly quotable: boolean;
  readonly swipeEnabled: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1">
      {quotable ? (
        <SwipeToQuote onQuote={onQuote} enabled={swipeEnabled}>
          {children}
        </SwipeToQuote>
      ) : (
        children
      )}
      {bar === null || (!pointer && align === 'end') ? null : (
        <View className={align === 'end' ? 'items-end' : 'items-start'}>{bar}</View>
      )}
    </View>
  );
}

export function MessageFrame({
  actions,
  preview,
  align,
  bar,
  swipeable,
  swipeEnabled = swipeable,
  onQuote,
  children,
}: FrameProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const expanded = useSizeClass().split;
  const menu = useContextMenu(actions.list, 'Message', {
    quick: actions.quick,
    preview,
    previewAlign: align,
  });
  const quotable = swipeable && !pointer;
  return (
    <Pressable
      accessible={false}
      onLongPress={pointer ? undefined : menu.onLongPress}
      delayLongPress={450}
      {...contextProps(menu.onContextMenu)}
      className="relative"
    >
      <View className="flex-row items-start gap-1">
        <MessageContent
          bar={bar}
          align={align}
          pointer={pointer}
          quotable={quotable}
          onQuote={onQuote}
          swipeEnabled={swipeEnabled}
        >
          {children}
        </MessageContent>
        {pointer && expanded ? <MessageMenu actions={actions} /> : null}
      </View>
      {menu.host}
      {actions.host}
    </Pressable>
  );
}
