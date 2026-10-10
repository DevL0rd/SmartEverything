import type { FunctionComponent, ReactElement } from 'react';
import { useEffect } from 'react';
import {
  View,
  type CellRendererProps,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { sinkOf } from './sink';

type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

type Cell<T> = FunctionComponent<CellRendererProps<T>>;

const cells = new Map<string, Cell<unknown>>();

function cellFor<T>(list: string): Cell<T> {
  const known = cells.get(list);
  if (known !== undefined) {
    return known;
  }
  const made: Cell<unknown> = function ProbeCell({
    index,
    children,
    onLayout,
    style,
    onFocusCapture,
  }: CellRendererProps<unknown>): ReactElement {
    useEffect(() => {
      sinkOf()?.listRows(list, 1, -1);
      return (): void => {
        sinkOf()?.listRows(list, -1, -1);
        sinkOf()?.listGone(list, index);
      };
    }, [index]);
    return (
      <View
        style={style}
        {...(onFocusCapture === undefined ? {} : { onFocusCapture })}
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          sinkOf()?.listCell(list, index, y, height);
          onLayout?.(event);
        }}
      >
        {children}
      </View>
    );
  };
  cells.set(list, made);
  return made;
}

export interface ListProbe<T> {
  readonly cell: Cell<T> | undefined;
  readonly onLayout: ((event: LayoutChangeEvent) => void) | undefined;
  readonly scrollWith: (other?: ScrollHandler) => ScrollHandler | undefined;
}

const OFF = {
  cell: undefined,
  onLayout: undefined,
  scrollWith: (other?: ScrollHandler): ScrollHandler | undefined => other,
};

export function useListProbe<T>(list: string, total: number): ListProbe<T> {
  if (!__DEV__) {
    return OFF;
  }
  sinkOf()?.listRows(list, 0, total);
  return {
    cell: cellFor<T>(list),
    onLayout: (event: LayoutChangeEvent): void => {
      sinkOf()?.listViewport(list, event.nativeEvent.layout.height);
    },
    scrollWith:
      (other?: ScrollHandler): ScrollHandler =>
      (event) => {
        sinkOf()?.listScroll(list, event.nativeEvent.contentOffset.y);
        other?.(event);
      },
  };
}
