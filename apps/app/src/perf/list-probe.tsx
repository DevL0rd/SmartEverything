import type { FunctionComponent, ReactElement, ReactNode, Ref } from 'react';
import { useEffect } from 'react';
import {
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Logger } from '@smarteverything/logging';
import { readDeveloperFlags } from '../developer/flags';
import { sinkOf } from './sink';

const log = new Logger('app.perf');
const TALL_CELL_PX = 900;

type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

interface CellProps {
  readonly index: number;
  readonly ref?: Ref<View> | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly children?: ReactNode;
  readonly onLayout?: ((event: LayoutChangeEvent) => void) | undefined;
}

type Cell = FunctionComponent<CellProps>;

const cells = new Map<string, Cell>();

function cellFor(list: string): Cell {
  const known = cells.get(list);
  if (known !== undefined) {
    return known;
  }
  const made: Cell = function ProbeCell({
    index,
    children,
    onLayout,
    style,
    ref,
  }: CellProps): ReactElement {
    useEffect(() => {
      sinkOf()?.listRows(list, 1, -1);
      return (): void => {
        sinkOf()?.listRows(list, -1, -1);
        sinkOf()?.listGone(list, index);
      };
    }, [index]);
    return (
      <View
        ref={ref}
        style={style}
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          sinkOf()?.listCell(list, index, y, height);
          if (height > TALL_CELL_PX) {
            log.warn('list.tall_cell', { list, index, y, height });
          }
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

export interface ListProbe {
  readonly cell: Cell | undefined;
  readonly onLayout: ((event: LayoutChangeEvent) => void) | undefined;
  readonly onContentSizeChange: ((width: number, height: number) => void) | undefined;
  readonly scrollWith: (other?: ScrollHandler) => ScrollHandler | undefined;
}

const OFF = {
  cell: undefined,
  onLayout: undefined,
  onContentSizeChange: undefined,
  scrollWith: (other?: ScrollHandler): ScrollHandler | undefined => other,
};

export function useListProbe(list: string | undefined, total: number): ListProbe {
  if (list === undefined || !__DEV__ || !readDeveloperFlags()['perf.lists']) {
    return OFF;
  }
  sinkOf()?.listRows(list, 0, total);
  return {
    cell: cellFor(list),
    onLayout: (event: LayoutChangeEvent): void => {
      sinkOf()?.listViewport(list, event.nativeEvent.layout.height);
    },
    onContentSizeChange: (_width: number, height: number): void => {
      sinkOf()?.listContent(list, height);
    },
    scrollWith:
      (other?: ScrollHandler): ScrollHandler =>
      (event) => {
        sinkOf()?.listScroll(list, event.nativeEvent.contentOffset.y);
        other?.(event);
      },
  };
}
