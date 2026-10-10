import { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { notify } from '../../../components/toast-store';
import { ValueStore, useValue } from '../../../design/external-store';
import { useTimeout } from './use-timeout';
import type { IndexScroller } from './use-thread-scroll';

const MESSAGE_PARAM = z.uuid();

const FLASH_MS = 700;

const POSITION = 0.35;

const flashed = new ValueStore<string | null>(null);

export function useFocusParam(): {
  readonly focus: string | null;
  readonly clearFocus: () => void;
} {
  const { message } = useLocalSearchParams<{ message?: string }>();
  const parsed = MESSAGE_PARAM.safeParse(message);
  return {
    focus: parsed.success ? parsed.data : null,
    clearFocus: (): void => {
      router.setParams({ message: undefined });
    },
  };
}

export function useFocusedMessage({
  keys,
  focusId,
  scroller,
  exhausted,
  loadMore,
  onDone,
}: {
  readonly keys: readonly string[];
  readonly focusId: string | null;
  readonly scroller: IndexScroller;
  readonly exhausted: boolean;
  readonly loadMore: () => void;
  readonly onDone: () => void;
}): string | null {
  const handled = useRef<string | null>(null);
  const timeout = useTimeout();
  useEffect(() => {
    if (focusId === null || handled.current === focusId) {
      return;
    }
    const index = keys.indexOf(focusId);
    if (index < 0) {
      if (exhausted) {
        handled.current = focusId;
        notify({ message: 'That message is no longer in this chat' });
        onDone();
        return;
      }
      loadMore();
      return;
    }
    handled.current = focusId;
    scroller.scrollTo(index, POSITION);
    flashed.set(focusId);
    timeout.start(FLASH_MS, () => {
      flashed.set(null);
      onDone();
    });
  }, [focusId, keys, exhausted, loadMore, onDone, scroller, timeout]);
  return useValue(flashed);
}
