export type PerformanceCard =
  | { readonly kind: 'cpu'; readonly key: string; readonly span: 1 | 2 }
  | { readonly kind: 'gpu'; readonly key: string; readonly span: 1 | 2; readonly gpuId: string }
  | { readonly kind: 'memory'; readonly key: string; readonly span: 1 | 2 }
  | { readonly kind: 'temps'; readonly key: string; readonly span: 1 | 2 }
  | { readonly kind: 'power'; readonly key: string; readonly span: 1 | 2 };

export function performanceCards(
  gpuIds: readonly string[],
  columns: 1 | 2 | 3 = 3,
): readonly PerformanceCard[] {
  const noGpu = gpuIds.length === 0;
  return [
    { kind: 'cpu', key: 'cpu', span: 2 },
    ...gpuIds.map((gpuId): PerformanceCard => ({
      kind: 'gpu',
      key: `gpu-${gpuId}`,
      span: 1,
      gpuId,
    })),
    { kind: 'memory', key: 'memory', span: 1 },
    { kind: 'temps', key: 'temps', span: noGpu && columns === 3 ? 2 : 1 },
    { kind: 'power', key: 'power', span: noGpu && columns === 2 ? 2 : 1 },
  ];
}

export function packRows<T extends { readonly span: 1 | 2 }>(
  cards: readonly T[],
  columns: 1 | 2 | 3,
): readonly (readonly T[])[] {
  const rows: T[][] = [];
  let used = 0;
  for (const card of cards) {
    const width = Math.min(card.span, columns);
    const last = rows.at(-1);
    if (last === undefined || used + width > columns) {
      rows.push([card]);
      used = width;
    } else {
      last.push(card);
      used += width;
    }
  }
  return rows;
}

export function spareColumns(
  row: readonly { readonly span: 1 | 2 }[],
  columns: 1 | 2 | 3,
): 0 | 1 | 2 {
  const used = row.reduce((sum, card) => sum + Math.min(card.span, columns), 0);
  const spare = columns - used;
  return spare >= 2 ? 2 : spare === 1 ? 1 : 0;
}
