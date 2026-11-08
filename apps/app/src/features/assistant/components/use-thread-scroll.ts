import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent } from 'react-native';
import type { ViewableChange, ViewableToken } from '../../../components/virtual-list-visibility';
import {
  pinTransition,
  shouldFollowContent,
  stuckAfterScroll,
  type ScrollSample,
  type ScrollMessage,
} from './thread-stick';
import { ValueStore } from '../../../design/external-store';
import { count } from '../../../perf/probe-kit';
import { useTimeout } from './use-timeout';

export const AWAY_PX = 160;

const PIN_MARGIN_PX = 120;

const PEEK_PX = 24;

const RETRY_MAX = 6;

const RETRY_MS = 60;

const REFINE_MS = [140, 420] as const;

const CHIP_MS = 900;

export interface Newest extends ScrollMessage {
  readonly unread: boolean;
  readonly mine: boolean;
}

type OffsetList = Pick<FlatList, 'scrollToOffset'>;
interface LayoutHeight {
  readonly nativeEvent: { readonly layout: { readonly height: number } };
}
interface ScrollOffset {
  readonly nativeEvent: Pick<NativeScrollEvent, 'contentOffset' | 'contentSize'>;
}

export const WINDOW_SIZE = 7;

export interface ThreadScroll {
  readonly away: boolean;
  readonly pinned: boolean;
  readonly activity: ValueStore<boolean>;
  readonly anchor: string | null;
  readonly onScroll: (event: ScrollOffset) => void;
  readonly onScrollBeginDrag: () => void;
  readonly onContentSizeChange: (width: number, height: number) => void;
  readonly onViewportLayout: (event: LayoutHeight) => void;
  readonly onNewestLayout: (event: LayoutHeight) => void;
  readonly toBottom: () => void;
}

interface PinState {
  readonly pinned: boolean;
  readonly observe: (sample: ScrollSample) => void;
  readonly release: () => void;
}

type Fit = 'unmeasured' | 'short' | 'roomy';

interface Size {
  viewport: number;
  height: number;
  key: string | null;
}

interface Geometry {
  readonly fit: Fit;
  readonly size: RefObject<Size>;
  readonly onViewportLayout: (event: LayoutHeight) => void;
  readonly onNewestLayout: (event: LayoutHeight) => void;
}

function fitOf(size: Size): Fit {
  if (size.viewport === 0 || size.height === 0) {
    return 'unmeasured';
  }
  return size.height > size.viewport - PIN_MARGIN_PX ? 'roomy' : 'short';
}

function useGeometry(key: string | null): Geometry {
  const size = useRef<Size>({ viewport: 0, height: 0, key: null });
  const [measured, setMeasured] = useState<{ readonly key: string | null; readonly fit: Fit }>({
    key: null,
    fit: 'unmeasured',
  });
  const measure = useCallback((): void => {
    setMeasured((current) => {
      const fit = fitOf(size.current);
      return current.key === size.current.key && current.fit === fit
        ? current
        : { key: size.current.key, fit };
    });
  }, []);
  const onViewportLayout = useCallback(
    (event: LayoutHeight): void => {
      count('lay.view');
      const next = event.nativeEvent.layout.height;
      size.current.viewport = next;
      measure();
    },
    [measure],
  );
  const onNewestLayout = useCallback(
    (event: LayoutHeight): void => {
      count('lay.newest');
      size.current.height = event.nativeEvent.layout.height;
      size.current.key = key;
      measure();
    },
    [key, measure],
  );
  const fit = measured.key === key ? measured.fit : 'unmeasured';
  return { fit, size, onViewportLayout, onNewestLayout };
}

function usePinOffset(): {
  readonly request: (offset: number) => void;
  readonly moved: (sample: ScrollSample) => boolean;
} {
  const position = useRef<ScrollSample | null>(null);
  const requestedOffset = useRef(0);
  const request = useCallback((offset: number): void => {
    requestedOffset.current = offset;
    position.current = null;
  }, []);
  return {
    request,
    moved: (sample): boolean => {
      const previous = position.current;
      if (previous === null && Math.round(sample.offset) !== Math.round(requestedOffset.current))
        return false;
      position.current = sample;
      return previous?.contentHeight === sample.contentHeight && previous.offset !== sample.offset;
    },
  };
}

interface Pin {
  readonly owner: Newest | null;
  readonly released: string | null;
  readonly follow: string | null;
}

interface ScrollTail {
  readonly newest: Newest | null;
  readonly reply: Newest | null;
}

function usePin(
  list: RefObject<OffsetList | null>,
  tail: ScrollTail,
  geometry: Pick<Geometry, 'fit' | 'size'> & { readonly away: boolean },
  stick: () => void,
): PinState {
  const [pin, setPin] = useState<Pin>({ owner: null, released: null, follow: null });
  const { request, moved } = usePinOffset();
  const opened = useRef(true);
  const { newest, reply } = tail;
  const candidate = newest?.reply === true ? newest : null;
  const { fit, size, away } = geometry;
  const transition = pinTransition(pin.owner, reply);
  if (pin.owner !== null && transition !== 'keep') {
    setPin({
      owner: null,
      released: pin.owner.key,
      follow: transition === 'follow' ? (reply?.key ?? null) : null,
    });
  }
  const release = (): void => {
    setPin({ owner: null, released: newest?.key ?? null, follow: null });
  };
  useEffect(() => {
    if (pin.follow === null) return;
    stick();
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [pin.follow, list, stick]);
  useEffect(() => {
    if (pin.owner !== null || candidate === null || fit === 'unmeasured') return;
    const wanted = candidate.streaming ? !away : opened.current && candidate.unread;
    opened.current = false;
    if (fit === 'roomy' && wanted && pin.released !== candidate.key) {
      const { viewport, height } = size.current;
      const offset = Math.max(0, height - viewport + PEEK_PX);
      request(offset);
      list.current?.scrollToOffset({ offset, animated: false });
      setPin({ owner: candidate, released: null, follow: null });
    }
  }, [candidate, fit, away, pin.owner, pin.released, list, size, request]);
  return {
    pinned: pin.owner !== null,
    observe: (sample): void => {
      if (pin.owner !== null && moved(sample)) release();
    },
    release,
  };
}

function useFollowOwn(
  list: RefObject<OffsetList | null>,
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
  readonly onContentSizeChange: (height: number, pinned: boolean) => void;
}

function useStick(list: RefObject<OffsetList | null>): Stick {
  const stuck = useRef(true);
  const sample = useRef<ScrollSample | null>(null);
  const height = useRef(0);
  const stick = useCallback((): void => {
    stuck.current = true;
  }, []);
  return {
    stick,
    onScrollSample: (next): void => {
      stuck.current = stuckAfterScroll(stuck.current, sample.current, next);
      sample.current = next;
    },
    onContentSizeChange: (next, pinned): void => {
      const follow = shouldFollowContent(!pinned && stuck.current, height.current, next);
      height.current = next;
      if (follow && sample.current?.offset !== 0) {
        list.current?.scrollToOffset({ offset: 0, animated: false });
      }
    },
  };
}

export function useThreadScroll(
  list: RefObject<OffsetList | null>,
  tail: ScrollTail,
): ThreadScroll {
  const { newest } = tail;
  const key = newest?.key ?? null;
  const [away, setAway] = useState(false);
  const geometry = useGeometry(key);
  const [activity] = useState(() => new ValueStore(false));
  const [anchor, setAnchor] = useState<string | null>(null);
  const quiet = useTimeout();
  const stick = useStick(list);
  const pin = usePin(list, tail, { fit: geometry.fit, size: geometry.size, away }, stick.stick);
  useFollowOwn(list, newest, { release: pin.release, stick: stick.stick });
  return {
    away,
    pinned: pin.pinned,
    activity,
    anchor,
    onContentSizeChange: (_width, height): void => {
      stick.onContentSizeChange(height, pin.pinned);
    },
    onScroll: (event): void => {
      const sample = {
        offset: event.nativeEvent.contentOffset.y,
        contentHeight: event.nativeEvent.contentSize.height,
      };
      stick.onScrollSample(sample);
      const nowAway = event.nativeEvent.contentOffset.y > AWAY_PX;
      if (nowAway && !away) {
        setAnchor(newest?.key ?? null);
      }
      setAway(nowAway);
      activity.set(true);
      quiet.start(CHIP_MS, () => {
        activity.set(false);
      });
      pin.observe(sample);
    },
    onScrollBeginDrag: pin.release,
    onViewportLayout: geometry.onViewportLayout,
    onNewestLayout: geometry.onNewestLayout,
    toBottom: (): void => {
      stick.stick();
      list.current?.scrollToOffset({ offset: 0, animated: true });
      pin.release();
    },
  };
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

function topKeyOf(change: ViewableChange): string | null {
  let top: ViewableToken | null = null;
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

export interface TopKey {
  readonly store: ValueStore<string | null>;
  readonly onViewableItemsChanged: (change: ViewableChange) => void;
}

export function useTopKey(): TopKey {
  const [topKey] = useState<TopKey>(() => {
    const store = new ValueStore<string | null>(null);
    return {
      store,
      onViewableItemsChanged: (change): void => {
        store.set(topKeyOf(change));
      },
    };
  });
  return topKey;
}
