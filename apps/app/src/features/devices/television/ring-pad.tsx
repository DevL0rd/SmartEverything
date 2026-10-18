import type { ReactNode } from 'react';
import { useId, useRef, useState } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { TV_KEY_LABELS, TV_KEY_REASON_TEXT } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { isNative } from '../../../design/platform';
import {
  WEDGES,
  chevronsPath,
  directionAt,
  ringBox,
  ringPath,
  wedgeShapePath,
  type Direction,
  type RingBox,
} from './ring-geometry';
import {
  KEY_EDGE,
  KEY_EDGE_ALPHA,
  KEY_FAILED,
  KEY_FILL,
  KEY_FOCUS,
  KEY_LOCKED_FILL,
} from './key-style';
import { useHoldRepeat } from './use-hold-repeat';
import type { Television } from './use-television';

interface RingPreset {
  readonly size: number;
  readonly frame: string;
  readonly ok: string;
  readonly small: boolean;
}

const RING_PRESETS = {
  card: { size: 96, frame: 'size-24', ok: 'size-10', small: true },
  quick: { size: 168, frame: 'size-42', ok: 'size-16', small: false },
  page: { size: 216, frame: 'size-54', ok: 'size-20', small: false },
} as const satisfies Readonly<Record<string, RingPreset>>;

export type RingSize = keyof typeof RING_PRESETS;

const ACTIONS = WEDGES.map(({ direction }) => ({
  name: direction,
  label: TV_KEY_LABELS[direction],
}));

const ADJUSTED: Readonly<Record<string, Direction>> = { increment: 'up', decrement: 'down' };

const PRESSED_OPACITY = 0.45;
const EDGE_WIDTH = 1;
const OK_SLOP = 4;
const CHEVRON_WIDTH = 2.2;
const DASH = '3 3';

function OkDisc({
  tv,
  preset,
}: {
  readonly tv: Television;
  readonly preset: RingPreset;
}): ReactNode {
  const reason = tv.view.locks.ok;
  const marked = reason !== undefined && tv.view.mode === 'on';
  const handlers = useHoldRepeat(
    () => {
      tv.press('ok');
    },
    () => null,
  );
  return (
    <Pressable
      {...handlers}
      hitSlop={OK_SLOP}
      accessibilityRole="button"
      accessibilityLabel={reason === undefined ? 'Select' : `Select, ${TV_KEY_REASON_TEXT[reason]}`}
      accessibilityState={{ disabled: reason !== undefined }}
      className={cn(
        'absolute items-center justify-center rounded-full active:scale-95',
        KEY_EDGE,
        KEY_FILL,
        'to-primary-container',
        KEY_FOCUS,
        preset.ok,
        marked && cn('border-dashed', KEY_LOCKED_FILL),
        tv.flash === 'ok' && KEY_FAILED,
      )}
    >
      <Text
        variant={preset.small ? 'caption' : 'body-strong'}
        tone={marked ? 'variant' : 'default'}
      >
        OK
      </Text>
    </Pressable>
  );
}

function RingArt({
  box,
  down,
  marked,
}: {
  readonly box: RingBox;
  readonly down: Direction | null;
  readonly marked: boolean;
}): ReactNode {
  const top = useColour('surface-raised');
  const bottom = useColour('surface-3');
  const edge = useColour('on-surface-variant');
  const gradient = useId();
  const ink = useColour('on-surface');
  const accent = useColour('primary');
  const pressed = WEDGES.find((wedge) => wedge.direction === down);
  const side = String(box.size);
  return (
    <Svg width={box.size} height={box.size} viewBox={`0 0 ${side} ${side}`}>
      <Defs>
        <LinearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
      </Defs>
      <Path
        d={ringPath(box)}
        fill={`url(#${gradient})`}
        stroke={edge}
        strokeOpacity={KEY_EDGE_ALPHA}
        strokeWidth={EDGE_WIDTH}
        {...(marked ? { strokeDasharray: DASH } : {})}
      />
      {pressed === undefined ? null : (
        <Path d={wedgeShapePath(box, pressed.angle)} fill={accent} fillOpacity={PRESSED_OPACITY} />
      )}
      <Path
        d={chevronsPath(box)}
        fill="none"
        stroke={ink}
        strokeWidth={CHEVRON_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface RingTouch {
  readonly down: Direction | null;
  readonly begin: (event: GestureResponderEvent) => void;
  readonly end: () => void;
  readonly press: () => void;
  readonly blur: () => void;
}

function useRingTouch(tv: Television, box: RingBox, onHeld: (() => void) | undefined): RingTouch {
  const active = useRef<Direction | null>(null);
  const [down, setDown] = useState<Direction | null>(null);
  const handlers = useHoldRepeat(
    (stop) => {
      if (active.current !== null) {
        tv.press(active.current, stop);
      }
    },
    () => {
      const direction = active.current;
      return direction === null || tv.view.locks[direction] !== undefined
        ? null
        : (tv.view.rates[direction] ?? null);
    },
    onHeld,
  );
  return {
    down,
    begin: (event): void => {
      active.current = directionAt(box, event.nativeEvent.locationX, event.nativeEvent.locationY);
      setDown(active.current);
      handlers.onPressIn();
    },
    end: (): void => {
      setDown(null);
      handlers.onPressOut();
    },
    press: handlers.onPress,
    blur: handlers.onBlur,
  };
}

export function RingPad({
  tv,
  size,
  onHeld,
}: {
  readonly tv: Television;
  readonly size: RingSize;
  readonly onHeld?: () => void;
}): ReactNode {
  const preset = RING_PRESETS[size];
  const box = ringBox(preset.size);
  const touch = useRingTouch(tv, box, onHeld);
  const marked = tv.view.locks.up !== undefined && tv.view.mode === 'on';
  return (
    <View className={cn('items-center justify-center', preset.frame)}>
      <RingArt box={box} down={touch.down} marked={marked} />
      <Pressable
        onPressIn={touch.begin}
        onPressOut={touch.end}
        onPress={touch.press}
        onBlur={touch.blur}
        focusable={isNative()}
        accessible={isNative()}
        accessibilityRole="adjustable"
        accessibilityLabel="Navigation"
        accessibilityActions={ACTIONS}
        onAccessibilityAction={(event): void => {
          const name = event.nativeEvent.actionName;
          const direction =
            ADJUSTED[name] ?? WEDGES.find((entry) => entry.direction === name)?.direction;
          if (direction !== undefined) {
            tv.press(direction);
          }
        }}
        className={cn('absolute', preset.frame)}
      />
      <OkDisc tv={tv} preset={preset} />
    </View>
  );
}
