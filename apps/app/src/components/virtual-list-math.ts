export interface FixedRows {
  readonly rowLength: number;
  readonly topLength: number;
}

export interface ItemLayout {
  readonly length: number;
  readonly offset: number;
  readonly index: number;
}

export type HeaderLengths = ReadonlyMap<string, number>;

export function itemLayoutOf(
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

export function initialItemCount(layouts: readonly ItemLayout[], viewport: number): number {
  return layouts.filter((layout) => layout.offset < viewport).length + SPARE_ITEMS;
}
