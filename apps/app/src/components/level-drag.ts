import { useState } from 'react';
import { type LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { isNative } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import {
  LEVEL_MIN,
  LEVEL_SHAPE_RULES,
  LEVEL_SLOP,
  WHITE_MIN_KELVIN,
  crossedTick,
  kelvinAfterKey,
  kelvinAt,
  kelvinShare,
  levelAfterKey,
  levelAt,
  swallowNextClick,
  type LevelShape,
} from './level-math';

export type LevelPhase = 'live' | 'commit';

export interface DragProps {
  readonly onChange: (value: number, phase: LevelPhase) => void;
  readonly disabled?: boolean | undefined;
  readonly variant?: 'level' | 'white' | undefined;
  readonly shape?: LevelShape | undefined;
}

export interface Scale {
  readonly at: (x: number, width: number) => number;
  readonly share: (value: number) => number;
  readonly afterKey: (key: string, shift: boolean, current: number) => number | null;
  readonly fallback: number;
}

const LEVEL_SCALE: Scale = {
  at: levelAt,
  share: (value) => value,
  afterKey: levelAfterKey,
  fallback: LEVEL_MIN,
};

const WHITE_SCALE: Scale = {
  at: kelvinAt,
  share: kelvinShare,
  afterKey: kelvinAfterKey,
  fallback: WHITE_MIN_KELVIN,
};

export function scaleOf(variant: 'level' | 'white' | undefined): Scale {
  return variant === 'white' ? WHITE_SCALE : LEVEL_SCALE;
}

function panOf(
  enabled: boolean,
  move: (x: number) => void,
  finish: () => void,
  begin: () => void,
): ReturnType<typeof Gesture.Pan> {
  return Gesture.Pan()
    .runOnJS(true)
    .enabled(enabled)
    .activeOffsetX([-LEVEL_SLOP, LEVEL_SLOP])
    .failOffsetY([-LEVEL_SLOP, LEVEL_SLOP])
    .onStart((event) => {
      begin();
      move(event.x);
    })
    .onUpdate((event) => {
      move(event.x);
    })
    .onFinalize(() => {
      finish();
    });
}

function tapOf(enabled: boolean, jump: (x: number) => void): ReturnType<typeof Gesture.Tap> {
  return Gesture.Tap()
    .runOnJS(true)
    .enabled(enabled)
    .maxDistance(LEVEL_SLOP)
    .onEnd((event, success) => {
      if (success) {
        jump(event.x);
      }
    });
}

export function useSurfaceDrag(props: DragProps): {
  readonly gesture: ReturnType<typeof Gesture.Exclusive>;
  readonly draft: number | null;
  readonly measure: (event: LayoutChangeEvent) => void;
} {
  const { onChange, disabled = false } = props;
  const scale = scaleOf(props.variant);
  const length = useSharedValue(0);
  const last = useSharedValue<number | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const move = (x: number): void => {
    const next = scale.at(x, length.get());
    const before = last.get();
    if (next === before) {
      return;
    }
    if (scale === LEVEL_SCALE && crossedTick(before, next)) {
      selectionTick();
    }
    last.set(next);
    setDraft(next);
    onChange(next, 'live');
  };
  const finish = (): void => {
    const next = last.get();
    last.set(null);
    setDraft(null);
    if (next !== null) {
      onChange(next, 'commit');
    }
  };
  const pan = panOf(!disabled, move, finish, () => {
    last.set(null);
    if (!isNative()) {
      swallowNextClick(document);
    }
  });
  const jumps = !disabled && LEVEL_SHAPE_RULES[props.shape ?? 'bar'].jumpsOnTap;
  const tap = tapOf(jumps, (x) => {
    selectionTick();
    onChange(scale.at(x, length.get()), 'commit');
  });
  const gesture = Gesture.Exclusive(pan, tap);
  const measure = (event: LayoutChangeEvent): void => {
    length.set(event.nativeEvent.layout.width);
  };
  return { gesture, draft, measure };
}
