import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

const EDGE = 2;

export type Ground = 'surface-1' | 'surface-raised';

const FROM: Readonly<Record<Ground, { readonly start: string; readonly end: string }>> = {
  'surface-1': {
    start: 'bg-linear-to-r from-surface-1 to-transparent',
    end: 'bg-linear-to-l from-surface-1 to-transparent',
  },
  'surface-raised': {
    start: 'bg-linear-to-r from-surface-raised to-transparent',
    end: 'bg-linear-to-l from-surface-raised to-transparent',
  },
};

export interface Edges {
  readonly start: boolean;
  readonly end: boolean;
  readonly scroll: {
    readonly scrollEventThrottle: number;
    readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    readonly onContentSizeChange: (width: number) => void;
  };
  readonly onViewport: (width: number) => void;
}

export function useEdges(): Edges {
  const [start, setStart] = useState(false);
  const [end, setEnd] = useState(false);
  const [content, setContent] = useState(0);
  const [viewport, setViewport] = useState(0);
  const update = (offset: number, view: number, total: number): void => {
    setStart(offset > EDGE);
    setEnd(offset + view < total - EDGE);
  };
  return {
    start,
    end,
    scroll: {
      scrollEventThrottle: 32,
      onScroll: (event): void => {
        const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
        update(contentOffset.x, layoutMeasurement.width, contentSize.width);
      },
      onContentSizeChange: (width): void => {
        setContent(width);
        update(0, viewport, width);
      },
    },
    onViewport: (width): void => {
      setViewport(width);
      update(0, width, content);
    },
  };
}

export function EdgeFades({
  start,
  end,
  ground,
}: {
  readonly start: boolean;
  readonly end: boolean;
  readonly ground: Ground;
}): ReactNode {
  return (
    <>
      {start ? (
        <View
          pointerEvents="none"
          className={`absolute inset-y-0 left-0 w-8 ${FROM[ground].start}`}
        />
      ) : null}
      {end ? (
        <View
          pointerEvents="none"
          className={`absolute inset-y-0 right-0 w-8 ${FROM[ground].end}`}
        />
      ) : null}
    </>
  );
}
