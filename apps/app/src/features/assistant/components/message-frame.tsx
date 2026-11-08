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
  readonly align: 'start' | 'end';
  readonly bar: ReactNode;
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

function MenuPreviewOf({
  align,
  bar,
  children,
}: Pick<FrameProps, 'align' | 'bar' | 'children'>): ReactNode {
  if (align === 'end') return children;
  return (
    <View className="rounded-2xl border-hairline border-outline-variant bg-bg px-3 py-2.5">
      {children}
      {bar}
    </View>
  );
}

export function MessageFrame({
  actions,
  align,
  bar,
  swipeEnabled = true,
  onQuote,
  children,
}: FrameProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const expanded = useSizeClass().split;
  const menu = useContextMenu(actions.list, 'Message', {
    ...(actions.header === null ? {} : { header: actions.header }),
    preview: (
      <MenuPreviewOf align={align} bar={bar}>
        {children}
      </MenuPreviewOf>
    ),
  });
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
          quotable={!pointer}
          onQuote={onQuote}
          swipeEnabled={swipeEnabled}
        >
          {children}
          {actions.reactionFooter(align)}
        </MessageContent>
        {pointer && expanded ? <MessageMenu actions={actions} /> : null}
      </View>
      {menu.host}
      {actions.host}
    </Pressable>
  );
}
