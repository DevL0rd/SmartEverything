import type { ReactNode, RefObject } from 'react';
import {
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { levelFrameClass, type LevelFrame } from './level-frame';
import { scaleOf, useSurfaceDrag, type LevelPhase } from './level-drag';
import {
  LEVEL_MAX,
  LEVEL_SHAPE_RULES,
  WHITE_MAX_KELVIN,
  WHITE_MIN_KELVIN,
  levelAfterAction,
  levelLabel,
  thumbFormOf,
  whiteLabel,
  type LevelShape,
  type Mixed,
  type ThumbForm,
  type ThumbPolicy,
} from './level-math';
import { Fill, MixedMarks, Thumb, WhiteTrack } from './level-marks';
import { useFocusedKeys } from './focused-keys';
import { Text } from './text';

export type { LevelShape };

export interface LevelSurfaceProps {
  readonly value: number | null;
  readonly onChange: (value: number, phase: LevelPhase) => void;
  readonly label: string;
  readonly tint?: string | undefined;
  readonly mixed?: Mixed | undefined;
  readonly disabled?: boolean;
  readonly variant?: 'level' | 'white';
  readonly children?: ReactNode;
  readonly shape?: LevelShape;
  readonly showValue?: boolean;
  readonly adjustable?: boolean;
  readonly valueText?: string | undefined;
  readonly trailing?: ReactNode;
  readonly onToggle?: (() => void) | undefined;
  readonly className?: string | undefined;
  readonly thumb?: ThumbPolicy | undefined;
  readonly restingValue?: number | null | undefined;
  readonly focusRef?: RefObject<View | null> | undefined;
}

const WHITE_THUMB_FLIP = 70;

function ValueLabel({
  text,
  dragging,
  flip,
}: {
  readonly text: string;
  readonly dragging: boolean;
  readonly flip: boolean;
}): ReactNode {
  return (
    <View
      className={cn('ml-auto rounded-sm bg-surface-1/90 px-1.5', flip && 'absolute left-2 top-1')}
      pointerEvents="none"
    >
      <Text variant={dragging ? 'title-3' : 'callout'} className="tabular" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

interface Reading {
  readonly white: boolean;
  readonly scale: ReturnType<typeof scaleOf>;
  readonly shown: number | null;
  readonly lit: boolean;
  readonly percent: number;
  readonly dragging: boolean;
}

function readingOf(
  props: Pick<LevelSurfaceProps, 'value' | 'variant' | 'disabled'>,
  draft: number | null,
): Reading {
  const white = props.variant === 'white';
  const scale = scaleOf(props.variant);
  const shown = draft ?? props.value;
  return {
    white,
    scale,
    shown,
    lit: shown !== null && props.disabled !== true,
    percent: shown === null ? 0 : scale.share(shown),
    dragging: draft !== null,
  };
}

function textOf(reading: Reading, mixed: Mixed | undefined): string {
  return reading.white ? whiteLabel(reading.shown, mixed) : levelLabel(reading.shown, mixed);
}

function accessText(reading: Reading): string {
  if (reading.white) {
    return whiteLabel(reading.shown, undefined);
  }
  return reading.shown === null ? 'Off' : `${String(reading.shown)} percent`;
}

function useAccess(props: LevelSurfaceProps, reading: Reading, keyboard: boolean): ViewProps {
  const { onChange, onToggle, label, value, disabled } = props;
  const { scale, white, shown } = reading;
  const current = shown ?? scale.fallback;
  const nudge = (next: number | null): boolean => {
    if (next !== null) {
      onChange(next, 'commit');
    }
    return next !== null;
  };
  const focus = useFocusedKeys(keyboard, (key, shift) => {
    if (key === 'Enter' && onToggle !== undefined) {
      onToggle();
      return true;
    }
    return nudge(scale.afterKey(key, shift, current));
  });
  const onAction = (event: AccessibilityActionEvent): void => {
    const name = event.nativeEvent.actionName;
    if (name === 'activate') {
      onToggle?.();
    } else if (!white && (name === 'increment' || name === 'decrement')) {
      nudge(levelAfterAction(name, current));
    }
  };
  const toggle =
    onToggle === undefined
      ? []
      : [{ name: 'activate', label: value === null ? 'Turn on' : 'Turn off' }];
  return {
    accessible: true,
    focusable: keyboard,
    onFocus: focus.onFocus,
    onBlur: focus.onBlur,
    accessibilityRole: 'adjustable',
    accessibilityLabel: label,
    'aria-disabled': disabled === true,
    accessibilityValue: {
      min: white ? WHITE_MIN_KELVIN : 0,
      max: white ? WHITE_MAX_KELVIN : LEVEL_MAX,
      ...(shown === null ? {} : { now: shown }),
      text: accessText(reading),
    },
    accessibilityActions: [
      ...(white ? [] : [{ name: 'increment' }, { name: 'decrement' }]),
      ...toggle,
    ],
    onAccessibilityAction: onAction,
  };
}

function Marks({
  tint,
  mixed,
  reading,
  thumb,
  resting,
}: {
  readonly tint: string | undefined;
  readonly mixed: Mixed | undefined;
  readonly reading: Reading;
  readonly thumb: ThumbForm;
  readonly resting: number | null | undefined;
}): ReactNode {
  const { white, lit, percent, scale } = reading;
  const restingPercent = resting === null || resting === undefined ? 0 : scale.share(resting);
  return (
    <>
      {white ? <WhiteTrack disabled={!lit} /> : null}
      {!white && lit ? <Fill percent={percent} tint={tint} /> : null}
      {lit && mixed !== undefined ? <MixedMarks mixed={mixed} scale={scale.share} /> : null}
      <Thumb form={thumb} percent={lit ? percent : restingPercent} />
    </>
  );
}

function frameOf(props: LevelSurfaceProps): LevelFrame {
  return {
    shape: props.shape,
    white: props.variant === 'white',
    disabled: props.disabled === true,
    className: props.className,
  };
}

function thumbOf(props: LevelSurfaceProps, reading: Reading): ThumbForm {
  return thumbFormOf({
    policy: props.thumb ?? LEVEL_SHAPE_RULES[props.shape ?? 'bar'].thumb,
    off: reading.shown === null,
    disabled: props.disabled === true,
    dragging: reading.dragging,
  });
}

export function LevelLabel({ children }: { readonly children: string }): ReactNode {
  return (
    <Text
      variant="callout"
      numberOfLines={1}
      className="ml-3 shrink rounded-sm bg-surface-1/90 px-1.5"
    >
      {children}
    </Text>
  );
}

function Region({
  onLayout,
  children,
}: {
  readonly onLayout: ((event: LayoutChangeEvent) => void) | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      onLayout={onLayout}
      className="h-full min-w-0 flex-1 flex-row items-center gap-2"
      pointerEvents="box-none"
    >
      {children}
    </View>
  );
}

interface ContentProps {
  readonly marks: ReactNode;
  readonly focus: ReactNode;
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly trailing: ReactNode;
  readonly padded: boolean;
  readonly measure: (event: LayoutChangeEvent) => void;
}

function Content({
  marks,
  focus,
  label,
  children,
  trailing,
  padded,
  measure,
}: ContentProps): ReactNode {
  const rowClass = cn('h-full min-w-0 flex-row items-center gap-2', padded && 'pr-3');
  if (trailing === undefined) {
    return (
      <>
        {marks}
        {focus}
        <View className={rowClass} pointerEvents="box-none">
          {children}
          {label}
        </View>
      </>
    );
  }
  return (
    <View className={rowClass} pointerEvents="box-none">
      <Region onLayout={measure}>
        {marks}
        {focus}
        {children}
        {label}
      </Region>
      {trailing}
    </View>
  );
}

export function LevelSurface({ focusRef, ...props }: LevelSurfaceProps): ReactNode {
  const { mixed, children, showValue = true, valueText, trailing } = props;
  const idiom = useIdiom();
  const { gesture, draft, measure } = useSurfaceDrag(props);
  const reading = readingOf(props, draft);
  const access = useAccess(props, reading, idiom === 'pointer' && props.disabled !== true);
  const text = valueText ?? textOf(reading, mixed);
  const flip = reading.white && reading.lit && reading.percent > WHITE_THUMB_FLIP;
  const marks = (
    <Marks
      tint={props.tint}
      mixed={mixed}
      reading={reading}
      thumb={thumbOf(props, reading)}
      resting={props.restingValue}
    />
  );
  const focus =
    props.adjustable === false ? null : (
      <View
        {...access}
        ref={focusRef}
        className="absolute inset-0 border-2 border-transparent focus:border-focus"
        pointerEvents="none"
      />
    );
  const label = showValue ? (
    <ValueLabel text={text} dragging={reading.dragging} flip={flip} />
  ) : null;
  return (
    <GestureDetector gesture={gesture} touchAction="pan-y">
      <View
        onLayout={trailing === undefined ? measure : undefined}
        className={levelFrameClass(frameOf(props), idiom)}
      >
        <Content
          marks={marks}
          focus={focus}
          label={label}
          trailing={trailing}
          padded={props.shape !== 'fill'}
          measure={measure}
        >
          {children}
        </Content>
      </View>
    </GestureDetector>
  );
}
