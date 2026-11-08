import { useRef, useState, type RefObject } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import type { TodoItem } from '../todo/todo-model';

function initialTodoIndex(items: readonly TodoItem[]): number {
  const active = items.findIndex((item) => item.status === 'in_progress');
  if (active >= 0) return active;
  return Math.max(
    0,
    items.findLastIndex((item) => item.status === 'completed'),
  );
}

export function useInitialTodoScroll(items: readonly TodoItem[]): {
  readonly target: number;
  readonly scroll: RefObject<ScrollView | null>;
  readonly onRowLayout: (event: LayoutChangeEvent) => void;
  readonly onContentSizeChange: () => void;
} {
  const [target] = useState(() => initialTodoIndex(items));
  const scroll = useRef<ScrollView>(null);
  const contentReady = useRef(false);
  const targetY = useRef<number | null>(null);
  const positioned = useRef(false);
  const position = (): void => {
    if (positioned.current || !contentReady.current || targetY.current === null) return;
    const view = scroll.current;
    if (view === null) return;
    view.scrollTo({ y: targetY.current, animated: false });
    positioned.current = true;
  };
  const onRowLayout = (event: LayoutChangeEvent): void => {
    targetY.current = event.nativeEvent.layout.y;
    position();
  };
  return {
    target,
    scroll,
    onRowLayout,
    onContentSizeChange: (): void => {
      contentReady.current = true;
      position();
    },
  };
}
