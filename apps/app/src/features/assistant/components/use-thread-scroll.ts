import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewToken,
} from 'react-native';
import {
  finishedStreaming,
  shouldFollowContent,
  stuckAfterScroll,
  type ScrollSample,
} from './thread-stick';
import { count } from '../../../perf/probe-kit';
import { useTimeout } from './use-timeout';

export const AWAY_PX = 160;

const PIN_MARGIN_PX = 120;

const PEEK_PX = 24;

const RETRY_MAX = 6;

const RETRY_MS = 60;

const REFINE_MS = [140, 420] as const;

const CHIP_MS = 900;

export interface Newest {
  readonly key: string;
  readonly streaming: boolean;
  readonly unread: boolean;
  readonly mine: boolean;
}

interface Pin {
  readonly key: string | null;
  readonly mode: 'idle' | 'pinned' | 'released';
}

const NO_PIN: Pin = { key: null, mode: 'idle' };

const WINDOW_SIZE = 7;

const WINDOW_SIZE_MAX = 21;

export interface ThreadScroll {
  readonly windowSize: number;
  readonly away: boolean;
  readonly pinned: boolean;
  readonly active: boolean;
  readonly anchor: string | null;
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly onContentSizeChange: (width: number, height: number) => void;
  readonly onViewportLayout: (event: LayoutChangeEvent) => void;
  readonly onNewestLayout: (event: LayoutChangeEvent) => void;
  readonly toBottom: () => void;
}

interface PinState {
  readonly pinned: boolean;
  readonly observe: (away: boolean) => void;
  readonly release: (key?: string | null) => void;
}

type Fit = 'unmeasured' | 'short' | 'roomy';

interface Size {
  viewport: number;
  height: number;
  tallest: number;
}

interface Geometry {
  readonly fit: Fit;
  readonly windowSize: number;
  readonly size: RefObject<Size>;
  readonly onViewportLayout: (event: LayoutChangeEvent) => void;
  readonly onNewestLayout: (event: LayoutChangeEvent) => void;
}

function fitOf(size: Size): Fit {
  if (size.viewport === 0 || size.height === 0) {
    return 'unmeasured';
  }
  return size.height > size.viewport - PIN_MARGIN_PX ? 'roomy' : 'short';
}

function windowSizeOf(size: Size): number {
  if (size.viewport === 0) {
    return WINDOW_SIZE;
  }
  return Math.min(WINDOW_SIZE_MAX, Math.ceil((WINDOW_SIZE * size.tallest) / size.viewport));
}

function useGeometry(): Geometry {
  const size = useRef<Size>({ viewport: 0, height: 0, tallest: 0 });
  const [fit, setFit] = useState<Fit>('unmeasured');
  const [windowSize, setWindowSize] = useState(WINDOW_SIZE);
  const onViewportLayout = useCallback((event: LayoutChangeEvent): void => {
    count('lay.view');
    const next = event.nativeEvent.layout.height;
    size.current.viewport = next;
    size.current.tallest = Math.max(size.current.tallest, next);
    setFit(fitOf(size.current));
    setWindowSize(windowSizeOf(size.current));
  }, []);
  const onNewestLayout = useCallback((event: LayoutChangeEvent): void => {
    count('lay.newest');
    size.current.height = event.nativeEvent.layout.height;
    setFit(fitOf(size.current));
  }, []);
  return { fit, windowSize, size, onViewportLayout, onNewestLayout };
}

function usePin(
  list: RefObject<FlatList | null>,
  newest: Newest | null,
  geometry: Pick<Geometry, 'fit' | 'size'> & { readonly away: boolean },
): PinState {
  const [pin, setPin] = useState<Pin>(NO_PIN);
  const awaySeen = useRef(false);
  const opened = useRef(true);
  const { fit, size, away } = geometry;
  useEffect(() => {
    if (newest === null || fit === 'unmeasured' || pin.key === newest.key) {
      return;
    }
    const wanted = newest.streaming ? !away : opened.current && newest.unread;
    opened.current = false;
    if (fit === 'roomy' && wanted) {
      awaySeen.current = false;
      const { viewport, height } = size.current;
      list.current?.scrollToOffset({ offset: height - viewport + PEEK_PX, animated: false });
      setPin({ key: newest.key, mode: 'pinned' });
    }
  }, [newest, fit, away, pin.key, list, size]);
  return {
    pinned: pin.mode === 'pinned',
    observe: (nowAway): void => {
      if (pin.mode !== 'pinned') {
        return;
      }
      if (nowAway) {
        awaySeen.current = true;
      } else if (awaySeen.current) {
        setPin((current) => ({ ...current, mode: 'released' }));
      }
    },
    release: (key): void => {
      setPin((current) => ({ key: key === undefined ? current.key : key, mode: 'released' }));
    },
  };
}

function useFollowOwn(
  list: RefObject<FlatList | null>,
  newest: Newest | null,
  follow: { readonly release: () => void; readonly stick: () => void },
): void {
  const seen = useRef(newest?.key ?? null);
  const key = newest?.key ?? null;
  const mine = newest?.mine === true;
  const { release, stick } = follow;
  useEffect(() => {
    if (key === seen.current) {
      return;
    }
    seen.current = key;
    if (mine) {
      stick();
      list.current?.scrollToOffset({ offset: 0, animated: true });
      release();
    }
  }, [key, mine, list, release, stick]);
}

interface Stick {
  readonly stick: () => void;
  readonly onScrollSample: (sample: ScrollSample) => void;
  readonly onContentSizeChange: (width: number, height: number) => void;
}

function useStick(
  list: RefObject<FlatList | null>,
  newest: Newest | null,
  release: () => void,
): Stick {
  const stuck = useRef(true);
  const sample = useRef<ScrollSample | null>(null);
  const height = useRef(0);
  const before = useRef(newest);
  useEffect(() => {
    const finished = finishedStreaming(before.current, newest);
    before.current = newest;
    if (finished) {
      stuck.current = true;
      release();
      list.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [newest, list, release]);
  return {
    stick: (): void => {
      stuck.current = true;
    },
    onScrollSample: (next): void => {
      stuck.current = stuckAfterScroll(stuck.current, sample.current, next);
      sample.current = next;
    },
    onContentSizeChange: (_width, next): void => {
      const follow = shouldFollowContent(stuck.current, height.current, next);
      height.current = next;
      if (follow) {
        list.current?.scrollToOffset({ offset: 0, animated: false });
      }
    },
  };
}

export function useThreadScroll(
  list: RefObject<FlatList | null>,
  newest: Newest | null,
): ThreadScroll {
  const key = newest?.key ?? null;
  const [away, setAway] = useState(false);
  const geometry = useGeometry();
  const [active, setActive] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const quiet = useTimeout();
  const pin = usePin(list, newest, { fit: geometry.fit, size: geometry.size, away });
  const stick = useStick(list, newest, pin.release);
  useFollowOwn(list, newest, { release: pin.release, stick: stick.stick });
  return {
    windowSize: geometry.windowSize,
    away,
    pinned: pin.pinned,
    active,
    anchor,
    onContentSizeChange: stick.onContentSizeChange,
    onScroll: (event): void => {
      stick.onScrollSample({
        offset: event.nativeEvent.contentOffset.y,
        contentHeight: event.nativeEvent.contentSize.height,
      });
      const nowAway = event.nativeEvent.contentOffset.y > AWAY_PX;
      if (nowAway && !away) {
        setAnchor(newest?.key ?? null);
      }
      setAway(nowAway);
      setActive(true);
      quiet.start(CHIP_MS, () => {
        setActive(false);
      });
      pin.observe(nowAway);
    },
    onViewportLayout: geometry.onViewportLayout,
    onNewestLayout: geometry.onNewestLayout,
    toBottom: (): void => {
      stick.stick();
      list.current?.scrollToOffset({ offset: 0, animated: true });
      pin.release(key);
    },
  };
}

export function unseenOf(messageKeys: readonly string[], anchor: string | null): number {
  const at = anchor === null ? -1 : messageKeys.indexOf(anchor);
  return Math.max(0, at);
}

export interface IndexScroller {
  readonly scrollTo: (index: number, viewPosition: number) => void;
  readonly onFailed: (info: { readonly index: number; readonly averageItemLength: number }) => void;
}

export function useIndexScroller(list: RefObject<FlatList | null>): IndexScroller {
  const tries = useRef(0);
  const target = useRef<{ readonly index: number; readonly viewPosition: number } | null>(null);
  const retry = useTimeout();
  const refine = useTimeout();
  return {
    scrollTo: (index, viewPosition): void => {
      tries.current = 0;
      target.current = { index, viewPosition };
      list.current?.scrollToIndex({ index, viewPosition, animated: false });
      refine.start(REFINE_MS[0], () => {
        list.current?.scrollToIndex({ index, viewPosition, animated: false });
        refine.start(REFINE_MS[1] - REFINE_MS[0], () => {
          list.current?.scrollToIndex({ index, viewPosition, animated: false });
        });
      });
    },
    onFailed: (info): void => {
      const wanted = target.current;
      if (wanted === null || tries.current >= RETRY_MAX) {
        return;
      }
      tries.current += 1;
      list.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
      retry.start(RETRY_MS, () => {
        list.current?.scrollToIndex({ ...wanted, animated: false });
      });
    },
  };
}

interface ViewableChange {
  readonly viewableItems: readonly ViewToken[];
}

function topKeyOf(change: ViewableChange): string | null {
  let top: ViewToken | null = null;
  for (const token of change.viewableItems) {
    if (
      token.isViewable &&
      token.index !== null &&
      (top === null || token.index > (top.index ?? 0))
    ) {
      top = token;
    }
  }
  return top?.key ?? null;
}

export function useTopKey(): {
  readonly topKey: string | null;
  readonly onViewableItemsChanged: (change: ViewableChange) => void;
} {
  const [topKey, setTopKey] = useState<string | null>(null);
  const [onViewableItemsChanged] = useState(() => (change: ViewableChange): void => {
    setTopKey(topKeyOf(change));
  });
  return { topKey, onViewableItemsChanged };
}
