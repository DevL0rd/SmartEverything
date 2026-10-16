import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import type { HsvColor } from '@smarteverything/domain';
import { cn } from '../design/cn';
import { useFocusedKeys } from './slider';
import {
  COLOUR_SIZE,
  COLOUR_PADDING,
  colourAt,
  colourCss,
  colourPoint,
  hueSector,
  nudgeColour,
  type ColourViewport,
} from './colour-picker-model';

const SECTOR_STEP = 2;
const WHEEL_MAX_SIZE = 288;
const WHEEL_MIN_SIZE = 160;
const SHEET_CHROME_HEIGHT = 280;
const HUES = Array.from({ length: 360 / SECTOR_STEP }, (_, index) => index * SECTOR_STEP);
const SWATCHES: readonly { readonly name: string; readonly colour: HsvColor }[] = [
  { name: 'Warm', colour: { hue: 32, saturation: 52, value: 100 } },
  { name: 'Candle', colour: { hue: 24, saturation: 65, value: 100 } },
  { name: 'Daylight', colour: { hue: 45, saturation: 5, value: 96 } },
  { name: 'Ice', colour: { hue: 212, saturation: 19, value: 100 } },
  { name: 'Rose', colour: { hue: 350, saturation: 45, value: 100 } },
  { name: 'Violet', colour: { hue: 254, saturation: 39, value: 100 } },
  { name: 'Teal', colour: { hue: 178, saturation: 56, value: 83 } },
  { name: 'Lime', colour: { hue: 77, saturation: 50, value: 88 } },
];

interface Props {
  readonly value: HsvColor | null;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onChange: (colour: HsvColor) => void;
  readonly onCommit: (colour: HsvColor) => void;
}

function Disk({ value }: { readonly value: HsvColor | null }): ReactNode {
  const id = useId();
  const marker = value === null ? null : colourPoint(value);
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`${String(-COLOUR_PADDING)} ${String(-COLOUR_PADDING)} ${String(COLOUR_SIZE + COLOUR_PADDING * 2)} ${String(COLOUR_SIZE + COLOUR_PADDING * 2)}`}
      aria-hidden
    >
      <Defs>
        <RadialGradient id={id}>
          <Stop offset="0" stopColor="white" />
          <Stop offset="1" stopColor="white" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {HUES.map((hue) => (
        <Path
          key={hue}
          d={hueSector(hue, SECTOR_STEP + 0.5)}
          fill={`hsl(${String(hue)}, 100%, 50%)`}
        />
      ))}
      <Circle cx={128} cy={128} r={128} fill={`url(#${id})`} />
      {marker === null ? null : (
        <>
          <Circle cx={marker.x} cy={marker.y} r={10} fill="none" stroke="black" strokeWidth={5} />
          <Circle cx={marker.x} cy={marker.y} r={10} fill="none" stroke="white" strokeWidth={3} />
        </>
      )}
    </Svg>
  );
}

function useWheel({ value, disabled = false, onChange, onCommit }: Props): {
  readonly focus: ReturnType<typeof useFocusedKeys>;
  readonly gesture: ReturnType<typeof Gesture.Pan>;
  readonly setSize: (size: ColourViewport) => void;
  readonly current: HsvColor;
} {
  const [size, setSize] = useState<ColourViewport>({ width: COLOUR_SIZE, height: COLOUR_SIZE });
  const last = useSharedValue<HsvColor | null>(null);
  const current = value ?? { hue: 0, saturation: 0, value: 100 };
  const focus = useFocusedKeys(!disabled, (key) => {
    const next = nudgeColour(current, key);
    if (next === null) return false;
    onChange(next);
    onCommit(next);
    return true;
  });
  const move = (x: number, y: number): void => {
    const next = colourAt(x, y, size, current.value);
    last.set(next);
    onChange(next);
  };
  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .minDistance(0)
    .onBegin((event) => {
      move(event.x, event.y);
    })
    .onUpdate((event) => {
      move(event.x, event.y);
    })
    .onFinalize((_event, success) => {
      const next = last.get();
      last.set(null);
      if (success && next !== null) onCommit(next);
    });
  return { focus, gesture, setSize, current };
}

function colourDescription(value: Props['value']): string {
  return value === null
    ? 'Mixed or unknown colour'
    : `Hue ${String(value.hue)} degrees, saturation ${String(value.saturation)} percent`;
}

function Wheel(props: Props): ReactNode {
  const { value, label, disabled = false, onCommit } = props;
  const { focus, gesture, setSize, current } = useWheel(props);
  const { height } = useWindowDimensions();
  const frame = {
    maxWidth: Math.min(WHEEL_MAX_SIZE, Math.max(WHEEL_MIN_SIZE, height - SHEET_CHROME_HEIGHT)),
  };
  return (
    <View
      accessible
      focusable={!disabled}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={current.hue}
      aria-valuetext={colourDescription(value)}
      accessibilityHint="Drag to choose hue and saturation. Arrow left and right change hue; up and down change saturation."
      accessibilityValue={{ text: colourDescription(value) }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (disabled) return;
        const next = nudgeColour(
          current,
          event.nativeEvent.actionName === 'increment' ? 'ArrowRight' : 'ArrowLeft',
        );
        if (next !== null) onCommit(next);
      }}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={frame}
      className={cn(
        'aspect-square w-full max-w-72 self-center rounded-full focus:outline-2 focus:outline-offset-2 focus:outline-focus',
        disabled && 'opacity-40',
      )}
    >
      <GestureDetector gesture={gesture}>
        <View
          className="h-full w-full"
          onLayout={(event) => {
            setSize(event.nativeEvent.layout);
          }}
        >
          <Disk value={value} />
        </View>
      </GestureDetector>
    </View>
  );
}

export function ColourPicker(props: Props): ReactNode {
  return (
    <View className="gap-3">
      <Wheel {...props} />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={`${props.label} presets`}
        className="flex-row flex-wrap justify-center gap-2"
      >
        {SWATCHES.map(({ name, colour }) => {
          const fill = { backgroundColor: colourCss(colour) };
          return (
            <Pressable
              key={name}
              accessibilityRole="radio"
              accessibilityLabel={name}
              accessibilityState={{
                checked: props.value !== null && colourCss(props.value) === colourCss(colour),
                disabled: props.disabled === true,
              }}
              disabled={props.disabled}
              onPress={() => {
                props.onCommit(colour);
              }}
              style={fill}
              className="size-touch-min rounded-full border-2 border-outline focus:outline-2 focus:outline-offset-2 focus:outline-focus"
            />
          );
        })}
      </View>
    </View>
  );
}
