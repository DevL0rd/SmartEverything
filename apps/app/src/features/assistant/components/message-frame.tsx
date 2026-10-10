import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Point } from '../../../components/interactive';
import { useContextMenu } from '../../../components/menu';
import { useIdiom } from '../../../design/platform';
import type { MessageActions } from './message-actions';
import { HoverBar } from './message-action-bars';
import { SwipeToQuote } from './swipe-quote';
import { useTimeout } from './use-timeout';

const GRACE_MS = 200;

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

function useHover(): {
  readonly hovered: boolean;
  readonly enter: () => void;
  readonly leave: () => void;
} {
  const [hovered, setHovered] = useState(false);
  const timeout = useTimeout();
  return {
    hovered,
    enter: (): void => {
      timeout.clear();
      setHovered(true);
    },
    leave: (): void => {
      timeout.start(GRACE_MS, () => {
        setHovered(false);
      });
    },
  };
}

interface FrameProps {
  readonly actions: MessageActions;
  readonly preview: ReactNode;
  readonly align: 'start' | 'end';
  readonly bar: ReactNode;
  readonly swipeable: boolean;
  readonly reserve: boolean;
  readonly onQuote: () => void;
  readonly children: ReactNode;
}

function Bar({
  actions,
  align,
  bar,
  reserve,
  visible,
}: Pick<FrameProps, 'actions' | 'align' | 'bar' | 'reserve'> & {
  readonly visible: boolean;
}): ReactNode {
  return (
    <HoverBar
      specs={actions.plan.hover}
      run={actions.run}
      quick={actions.quick}
      list={actions.list}
      visible={visible}
      align={align}
      meta={bar}
      reserve={reserve}
    />
  );
}

export function MessageFrame({
  actions,
  preview,
  align,
  bar,
  swipeable,
  reserve,
  onQuote,
  children,
}: FrameProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const hover = useHover();
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
      onPointerEnter={hover.enter}
      onPointerLeave={hover.leave}
      {...contextProps(menu.onContextMenu)}
      className="relative"
    >
      <View>{quotable ? <SwipeToQuote onQuote={onQuote}>{children}</SwipeToQuote> : children}</View>
      {pointer && bar !== null ? (
        <Bar actions={actions} align={align} bar={bar} reserve={reserve} visible={hover.hovered} />
      ) : null}
      {menu.host}
      {actions.host}
    </Pressable>
  );
}
