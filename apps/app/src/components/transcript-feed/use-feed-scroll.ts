import { useEffect, useRef, type RefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';
import { background } from '@smarteverything/logging';
import { useScrollToTop } from 'expo-router';
import { useScreen } from '../screen-context';
import type { FeedItem } from './feed-items';

const JUMP_POSITION = 0.4;

interface FeedScroll {
  readonly listRef: RefObject<FlashListRef<FeedItem> | null>;
  readonly layout: (event: {
    readonly nativeEvent: { readonly layout: { readonly y: number } };
  }) => void;
  readonly jump: () => void;
  readonly anchorReady: () => void;
  readonly top: () => void;
  readonly scroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

function useFeedFocus(
  listRef: RefObject<FlashListRef<FeedItem> | null>,
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
  items: readonly FeedItem[],
  anchor: number | null,
  focus: boolean,
): FeedScroll {
  const listRef = useRef<FlashListRef<FeedItem>>(null);
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
    const index = items.findIndex((item) => item.kind === 'line' && item.hit.line.id === anchor);
    if (index < 0) return;
    jumped.current = anchor;
    const list = listRef.current;
    if (list === null) return;
    background(
      list.scrollToIndex({ index, animated: false, viewPosition: JUMP_POSITION }),
      'feed.jump_failed',
    );
  };
  return {
    listRef,
    anchorReady: (): void => {
      requestAnimationFrame(jump);
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
