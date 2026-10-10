import { useState } from 'react';
import { useWindowDimensions } from 'react-native';

export interface FixedRows {
  readonly rowLength: number;
  readonly topLength: number;
}

interface ItemLayout {
  readonly length: number;
  readonly offset: number;
  readonly index: number;
}

type HeaderLengths = ReadonlyMap<string, number>;

function itemLayoutOf(
  sections: readonly { readonly key: string; readonly data: readonly unknown[] }[],
  fixed: FixedRows,
  headers: HeaderLengths,
): readonly ItemLayout[] {
  const layouts: ItemLayout[] = [];
  let offset = fixed.topLength;
  const place = (length: number): void => {
    layouts.push({ length, offset, index: layouts.length });
    offset += length;
  };
  for (const section of sections) {
    place(headers.get(section.key) ?? HEADER_ESTIMATE);
    section.data.forEach(() => {
      place(fixed.rowLength);
    });
    place(0);
  }
  return layouts;
}

const HEADER_ESTIMATE = 38;

const SPARE_ITEMS = 4;

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
    initialItems: layouts.filter((layout) => layout.offset < height).length + SPARE_ITEMS,
  };
}
