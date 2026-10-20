import type { ReactNode } from 'react';
import type { LayoutChangeEvent, ViewProps } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { type SharedValue } from 'react-native-reanimated';
import { useContextMenu, type ContextMenu, type MenuItem } from '../components/menu';
import { useIdiom } from '../design/platform';
import type { NavDrag } from './use-nav-drag';
import { useRowDrag } from './use-row-drag';

export interface DraggableFace {
  readonly menu: ContextMenu;
  readonly swallowed: SharedValue<boolean>;
}

interface DraggableRowProps extends Pick<ViewProps, 'onPointerEnter' | 'onPointerLeave'> {
  readonly rowKey: string;
  readonly label: string;
  readonly drag: NavDrag;
  readonly items: readonly MenuItem[];
  readonly className: string;
  readonly children: (face: DraggableFace) => ReactNode;
}

export function DraggableRow({
  rowKey,
  label,
  drag,
  items,
  className,
  children,
  onPointerEnter,
  onPointerLeave,
}: DraggableRowProps): ReactNode {
  const menu = useContextMenu(items, label);
  const rowDrag = useRowDrag({
    rowKey,
    touch: useIdiom() === 'touch',
    topOf: drag.topOf,
    onLift: drag.lift,
    onMove: drag.move,
    onDrop: drag.release,
    onHold: (point) => {
      menu.onContextMenu?.(point);
    },
  });
  return (
    <GestureDetector gesture={rowDrag.gesture}>
      <Animated.View
        style={rowDrag.style}
        onLayout={(event: LayoutChangeEvent) => {
          const { y, height } = event.nativeEvent.layout;
          drag.measure(rowKey, y, height);
        }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className={className}
      >
        {children({ menu, swallowed: rowDrag.swallowed })}
        {menu.host}
      </Animated.View>
    </GestureDetector>
  );
}
