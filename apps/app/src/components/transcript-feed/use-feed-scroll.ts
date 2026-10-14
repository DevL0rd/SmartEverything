import { useEffect, useRef, type RefObject } from 'react';
import type {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useScrollToTop } from 'expo-router';
import { useScreen } from '../screen-context';
import type { TranscriptHit } from '@smarteverything/domain';

interface FeedScroll {
  readonly listRef: RefObject<FlatList<TranscriptHit> | null>;
  readonly layout: (event: LayoutChangeEvent) => void;
  readonly jump: () => void;
  readonly retryJump: (info: {
    readonly index: number;
    readonly averageItemLength: number;
  }) => void;
  readonly anchorReady: () => void;
  readonly top: () => void;
  readonly scroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

function useFeedFocus(
  listRef: RefObject<FlatList<TranscriptHit> | null>,
  offsetRef: RefObject<number>,
  focus: boolean,
): () => boolean {
  const focusedRef = useRef(false);
  useEffect(() => {
    focusedRef.current = false;
    if (focus) listRef.current?.scrollToOffset({ offset: offsetRef.current, animated: false });
  }, [focus, listRef, offsetRef]);
  return (): boolean => {
    if (!focus || focusedRef.current) return false;
    focusedRef.current = true;
    return true;
  };
}

export function useFeedScroll(
  rows: readonly TranscriptHit[],
  anchor: number | null,
  focus: boolean,
): FeedScroll {
  const listRef = useRef<FlatList<TranscriptHit>>(null);
  const jumped = useRef<number | null>(null);
  const offset = useRef(0);
  const { scrollY } = useScreen();
  useScrollToTop(listRef);
  const shouldFocus = useFeedFocus(listRef, offset, focus);
  useEffect(() => {
    jumped.current = null;
  }, [anchor]);
  const jump = (): void => {
    if (anchor === null || jumped.current === anchor) return;
    const index = rows.findIndex((hit) => hit.line.id === anchor);
    if (index < 0) return;
    jumped.current = anchor;
    listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.4 });
  };
  return {
    listRef,
    anchorReady: (): void => {
      requestAnimationFrame(jump);
    },
    retryJump: (info): void => {
      jumped.current = null;
      listRef.current?.scrollToOffset({
        offset: offset.current + info.index * info.averageItemLength,
        animated: false,
      });
    },
    scroll: (event): void => {
      scrollY.set(event.nativeEvent.contentOffset.y);
    },
    layout: (event): void => {
      offset.current = event.nativeEvent.layout.y;
      if (shouldFocus()) {
        listRef.current?.scrollToOffset({ offset: offset.current, animated: false });
      }
    },
    top: (): void => {
      listRef.current?.scrollToOffset({ offset: offset.current, animated: false });
    },
    jump,
  };
}
