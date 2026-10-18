import type { ReactNode } from 'react';
import { useId } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { cn } from '../design/cn';
import { useColour } from '../design/colour';
import {
  THUMB_WIDTH,
  mixedBandOf,
  percentString,
  thumbPlacement,
  type Mixed,
  type ThumbForm,
} from './level-math';

const WHOLE = 100;

function share(percent: number): ViewStyle {
  return { flex: Math.min(WHOLE, Math.max(0, percent)) };
}

function Tint({
  tint,
  className,
  style,
}: {
  readonly tint: string | undefined;
  readonly className: string;
  readonly style?: ViewStyle;
}): ReactNode {
  return (
    <View
      className={cn(tint === undefined && 'bg-primary', className)}
      style={tint === undefined ? style : [style, { backgroundColor: tint }]}
      pointerEvents="none"
    />
  );
}

function Along({
  before,
  children,
}: {
  readonly before: number;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="absolute inset-0 flex-row" pointerEvents="none">
      <View style={share(before)} />
      {children}
      <View style={share(WHOLE - before)} />
    </View>
  );
}

function widthOf(percent: number): ViewStyle {
  return { width: percentString(percent) };
}

export function Fill({
  percent,
  tint,
}: {
  readonly percent: number;
  readonly tint: string | undefined;
}): ReactNode {
  const style = widthOf(percent);
  return (
    <>
      <Tint
        tint={tint}
        className="absolute inset-y-0 left-0 opacity-40 dark:opacity-34"
        style={style}
      />
      <Tint tint={tint} className="absolute bottom-0 left-0 h-1 opacity-90" style={style} />
    </>
  );
}

const THUMB_CLASS: Readonly<Record<Exclude<ThumbForm, 'none'>, string>> = {
  bar: 'absolute inset-y-1 w-2 rounded-sm border-2 border-surface-1 bg-on-surface',
  notch: 'absolute bottom-0 h-2 w-4.5 rounded-full border-2 border-surface-1 bg-on-surface',
  dashed:
    'absolute inset-y-1 w-2 rounded-sm border-2 border-dashed border-on-surface-variant bg-surface-1',
};

export function Thumb({
  form,
  percent,
}: {
  readonly form: ThumbForm;
  readonly percent: number;
}): ReactNode {
  if (form === 'none') {
    return null;
  }
  return (
    <View
      className={THUMB_CLASS[form]}
      style={thumbPlacement(percent, THUMB_WIDTH[form])}
      pointerEvents="none"
    />
  );
}

export function MixedMarks({
  mixed,
  scale,
}: {
  readonly mixed: Mixed;
  readonly scale: (value: number) => number;
}): ReactNode {
  const band = mixedBandOf(mixed, scale);
  return (
    <>
      <View className="absolute inset-x-0 bottom-0 h-1.5 flex-row" pointerEvents="none">
        <View style={share(band.left)} />
        <View className="bg-primary" style={share(band.width)} />
        <View style={share(WHOLE - band.left - band.width)} />
      </View>
      {band.ticks.map((tick) => (
        <Along key={`${String(tick.left)}-${tick.colour}`} before={tick.left}>
          <TickMark colour={tick.colour} />
        </Along>
      ))}
    </>
  );
}

function TickMark({ colour }: { readonly colour: string }): ReactNode {
  const ink: ViewStyle = { backgroundColor: colour };
  return (
    <View className="mb-1.5 -ml-0.5 h-2 w-1 items-center self-end bg-surface-1">
      <View className="h-full w-0.5" style={ink} />
    </View>
  );
}

export function WhiteTrack({ disabled }: { readonly disabled: boolean }): ReactNode {
  const id = `white-${useId().replaceAll(':', '')}`;
  const warm = useColour('temp-warm');
  const middle = useColour('temp-neutral');
  const cool = useColour('temp-cool');
  if (disabled) {
    return <View className="absolute inset-0 bg-surface-3" pointerEvents="none" />;
  }
  return (
    <View className="absolute inset-0" pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={warm} />
            <Stop offset="0.5" stopColor={middle} />
            <Stop offset="1" stopColor={cool} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
