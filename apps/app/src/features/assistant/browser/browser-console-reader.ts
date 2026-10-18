import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import { notify } from '../../../components/toast-store';
import type {
  ConsolePage,
  ConsoleRecord,
  PreviewDiagnostics,
} from './browser-diagnostics-contract';
import {
  pinConsolePage,
  prependConsolePage,
  pinnedConsoleFull,
  type ConsoleWindow,
} from './browser-console-window';
import { background } from '@smarteverything/logging';
const TAIL_DISTANCE = 24;
export interface ScrollGeometry {
  readonly nativeEvent: {
    readonly contentOffset: { readonly y: number };
    readonly contentSize: { readonly height: number };
    readonly layoutMeasurement: { readonly height: number };
  };
}
export interface ConsoleReader {
  readonly listRef: RefObject<FlashListRef<ConsoleRecord> | null>;
  readonly page: ConsolePage;
  readonly pending: boolean;
  readonly hasNew: boolean;
  readonly limitReached: boolean;
  readonly skippedOlder: number;
  readonly pause: () => void;
  readonly older: () => void;
  readonly resume: () => void;
  readonly resize: () => void;
  readonly scroll: (event: ScrollGeometry) => void;
}
export function useConsoleReader(page: ConsolePage, controller: PreviewDiagnostics): ConsoleReader {
  const list = useRef<FlashListRef<ConsoleRecord>>(null);
  const [window, setWindow] = useState<ConsoleWindow>({ kind: 'tail' });
  const [pending, setPending] = useState(false);
  const latest = page.records.at(-1)?.id ?? null;
  useConsoleTail(list, window.kind === 'tail', page.records);
  const pause = (): void => {
    setWindow((current) => (current.kind === 'paused' ? current : pinConsolePage(page)));
  };
  const older = (): void => {
    const pinned = window.kind === 'paused' ? window : pinConsolePage(page);
    if (pinned.page.previousCursor === null || pending || pinnedConsoleFull(pinned)) return;
    setWindow(pinned);
    setPending(true);
    background(
      controller
        .loadOlder(pinned.page.previousCursor)
        .then((result) => {
          const merged = prependConsolePage(pinned, result);
          setWindow((current) => (current === pinned ? merged : current));
        })
        .catch((error: unknown) => {
          notify({ message: 'Older console entries could not be read', error, tone: 'critical' });
        })
        .finally(() => {
          setPending(false);
        }),
      'older.load_failed',
    );
  };
  return {
    listRef: list,
    page: window.kind === 'paused' ? window.page : page,
    pending,
    hasNew: window.kind === 'paused' && latest !== window.latestSeen,
    limitReached: window.kind === 'paused' && pinnedConsoleFull(window),
    skippedOlder: window.kind === 'paused' ? window.skippedOlder : 0,
    pause,
    older,
    resume: (): void => {
      setWindow({ kind: 'tail' });
    },
    resize: (): void => {
      if (window.kind === 'tail') list.current?.scrollToEnd({ animated: false });
    },
    scroll: (event): void => {
      if (window.kind === 'tail' && scrolledAway(event)) pause();
    },
  };
}

function useConsoleTail(
  list: RefObject<FlashListRef<ConsoleRecord> | null>,
  following: boolean,
  records: readonly ConsoleRecord[],
): void {
  useLayoutEffect(() => {
    if (following) list.current?.scrollToEnd({ animated: false });
  }, [list, following, records]);
}

function scrolledAway(event: ScrollGeometry): boolean {
  const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
  return contentSize.height - contentOffset.y - layoutMeasurement.height > TAIL_DISTANCE;
}
