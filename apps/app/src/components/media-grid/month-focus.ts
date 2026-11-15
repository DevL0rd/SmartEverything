import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import { background } from '@smarteverything/logging';
import type { MediaGridRow } from './justify';

export interface MonthFocus {
  readonly month: string;
  readonly onFocused: () => void;
}

export function rowMonthOf(row: MediaGridRow): string | null {
  if (row.kind === 'head') return row.day.key.slice(0, 7);
  const first = row.days?.[0];
  return first === undefined ? null : first.day.key.slice(0, 7);
}

export function useMonthFocus(
  rows: readonly MediaGridRow[],
  focus: MonthFocus | null | undefined,
): RefObject<FlashListRef<MediaGridRow> | null> {
  const list = useRef<FlashListRef<MediaGridRow>>(null);
  const reached = useRef<string | null>(null);
  const focused = useEffectEvent((month: string) => {
    const index = rows.findIndex((row) => rowMonthOf(row) === month);
    if (
      focus === null ||
      focus === undefined ||
      index < 0 ||
      list.current === null ||
      reached.current === month
    )
      return;
    reached.current = month;
    background(
      list.current.scrollToIndex({ index, animated: false }).then(focus.onFocused),
      'media_grid.focus_failed',
      { month },
    );
  });
  const month = focus?.month ?? null;
  useEffect(() => {
    if (month !== null) focused(month);
  }, [month, rows]);
  return list;
}
