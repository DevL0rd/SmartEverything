import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { cn } from '../design/cn';

const FADE_EDGE = 2;

const FADE_FROM = {
  bg: 'from-bg',
  card: 'from-surface-1',
} as const;

export type FadeSurface = keyof typeof FADE_FROM;

export function EndFade({ surface }: { readonly surface: FadeSurface }): ReactNode {
  return (
    <View
      pointerEvents="none"
      className={cn(
        'absolute inset-y-0 right-0 w-12 bg-linear-to-l to-transparent',
        FADE_FROM[surface],
      )}
    />
  );
}

export interface EndFadeState {
  readonly shown: boolean;
  readonly scroll: {
    readonly scrollEventThrottle: number;
    readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    readonly onContentSizeChange: (width: number) => void;
  };
}

export function useEndFade(viewport: number): EndFadeState {
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);
  return {
    shown: offset + viewport < content - FADE_EDGE,
    scroll: {
      scrollEventThrottle: 32,
      onScroll: (event): void => {
        setOffset(event.nativeEvent.contentOffset.x);
      },
      onContentSizeChange: setContent,
    },
  };
}
