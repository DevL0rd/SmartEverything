import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  initialItemCount,
  itemLayoutOf,
  type FixedRows,
  type HeaderLengths,
  type ItemLayout,
} from './virtual-list-math';

export type { FixedRows };

export interface RowLayout {
  readonly getItemLayout: ((data: unknown, index: number) => ItemLayout) | undefined;
  readonly reportHeader: (sectionKey: string, length: number) => void;
  readonly initialItems: number | null;
}

export function useRowLayout(
  sections: readonly { readonly key: string; readonly data: readonly unknown[] }[],
  fixed: FixedRows | undefined,
): RowLayout {
  const { height } = useWindowDimensions();
  const [headers, setHeaders] = useState<HeaderLengths>(new Map());
  const reportHeader = (sectionKey: string, length: number): void => {
    setHeaders((current) =>
      current.get(sectionKey) === length ? current : new Map(current).set(sectionKey, length),
    );
  };
  if (fixed === undefined) {
    return { getItemLayout: undefined, reportHeader, initialItems: null };
  }
  const layouts = itemLayoutOf(sections, fixed, headers);
  return {
    getItemLayout: (_, index) => layouts[index] ?? { length: 0, offset: 0, index },
    reportHeader,
    initialItems: initialItemCount(layouts, height),
  };
}
