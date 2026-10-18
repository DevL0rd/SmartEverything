import type { ReactNode, RefObject } from 'react';
import { useId, useRef, useState } from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ScrollView, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { cn } from '../design/cn';
import { isNative, useIdiom } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import {
  stripKeyTarget,
  stripLayout,
  type ColourStripDensity,
  type ColourStripSwatch,
} from './colour-strip-model';
import { SplitRing } from './split-ring';
import { Tap } from './tap';
import { useFocusedKeys } from './focused-keys';
import { Text } from './text';

export type { ColourStripDensity, ColourStripSwatch };

export interface ColourStripCurrent {
  readonly colours: readonly string[];
  readonly label: string;
}

export interface ColourStripProps {
  readonly label: string;
  readonly swatches: readonly ColourStripSwatch[];
  readonly selectedId: string | null;
  readonly current?: ColourStripCurrent | null;
  readonly density?: ColourStripDensity;
  readonly surface?: 'surface-1' | 'surface-2';
  readonly disabled?: boolean;
  readonly focusRef?: RefObject<View | null>;
  readonly onPick: (id: string) => void;
  readonly onMore: () => void;
}

type Idiom = 'touch' | 'pointer';

const HIT: Readonly<Record<Idiom, string>> = {
  touch: 'min-h-touch-min min-w-touch-min',
  pointer: 'min-h-8 min-w-8',
};
const RING: Readonly<Record<Idiom, string>> = { touch: 'size-8', pointer: 'size-7' };
const DOT: Readonly<Record<Idiom, string>> = { touch: 'size-7', pointer: 'size-6' };
const DOT_PX: Readonly<Record<Idiom, number>> = { touch: 28, pointer: 24 };
const FADE: Readonly<Record<'surface-1' | 'surface-2', string>> = {
  'surface-1': 'bg-linear-to-r from-surface-1/0 to-surface-1',
  'surface-2': 'bg-linear-to-r from-surface-2/0 to-surface-2',
};
const HUE_STOPS = ['#ff6b57', '#f2b45e', '#c2e070', '#5ed3cf', '#3987e5', '#d55181'] as const;
const HUE_GRADIENT: ViewStyle = {
  experimental_backgroundImage: `linear-gradient(135deg, ${HUE_STOPS.join(', ')})`,
};

function SvgHue({ size }: { readonly size: number }): ReactNode {
  const id = `hue-${useId().replaceAll(':', '')}`;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {HUE_STOPS.map((colour, index) => (
            <Stop key={colour} offset={index / (HUE_STOPS.length - 1)} stopColor={colour} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

function MoreDot({ size }: { readonly size: number }): ReactNode {
  const box: ViewStyle = { width: size, height: size };
  return (
    <View
      className={cn('rounded-full border-hairline border-track', !isNative() && 'overflow-hidden')}
      style={isNative() ? [HUE_GRADIENT, box] : box}
      pointerEvents="none"
    >
      {isNative() ? null : <SvgHue size={size} />}
    </View>
  );
}

function fillOf(colour: string): ViewStyle {
  return { backgroundColor: colour };
}

function Dot({ colour, idiom }: { readonly colour: string; readonly idiom: Idiom }): ReactNode {
  return (
    <View
      className={cn('rounded-full border-hairline border-track', DOT[idiom])}
      style={fillOf(colour)}
      pointerEvents="none"
    />
  );
}

interface SwatchProps {
  readonly swatch: ColourStripSwatch;
  readonly selected: boolean;
  readonly tabStop: boolean;
  readonly disabled: boolean;
  readonly idiom: Idiom;
  readonly captioned: boolean;
  readonly innerRef: (node: View | null) => void;
  readonly onPick: () => void;
}

function Swatch({
  swatch,
  selected,
  tabStop,
  disabled,
  idiom,
  captioned,
  innerRef,
  onPick,
}: SwatchProps): ReactNode {
  return (
    <Tap
      innerRef={innerRef}
      role="radio"
      label={swatch.label}
      checked={selected}
      focusable={tabStop}
      disabled={disabled}
      onPress={onPick}
      className={cn('items-center justify-center rounded-md', HIT[idiom], captioned && 'min-w-14')}
    >
      <View
        className={cn(
          'items-center justify-center rounded-full border-2',
          RING[idiom],
          selected ? 'border-on-surface' : 'border-transparent',
        )}
      >
        <Dot colour={swatch.colour} idiom={idiom} />
      </View>
      {captioned && swatch.caption !== undefined ? (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {swatch.caption}
        </Text>
      ) : null}
    </Tap>
  );
}

function CurrentSwatch({
  current,
  idiom,
  disabled,
  onMore,
}: {
  readonly current: ColourStripCurrent;
  readonly idiom: Idiom;
  readonly disabled: boolean;
  readonly onMore: () => void;
}): ReactNode {
  const [first] = current.colours;
  return (
    <>
      <Tap
        role="button"
        label={`Current colour: ${current.label}. Open colour picker`}
        disabled={disabled}
        onPress={onMore}
        className={cn('items-center justify-center rounded-md', HIT[idiom])}
      >
        <View className={cn('items-center justify-center', RING[idiom])}>
          {current.colours.length > 1 || first === undefined ? (
            <SplitRing colours={current.colours} size={DOT_PX[idiom] + 4} label={current.label} />
          ) : (
            <Dot colour={first} idiom={idiom} />
          )}
        </View>
      </Tap>
      <View className="h-6 w-px bg-track" pointerEvents="none" />
    </>
  );
}

function useOverflow(): {
  readonly overflowing: boolean;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly onContentSizeChange: (width: number) => void;
} {
  const [box, setBox] = useState({ frame: 0, content: 0 });
  return {
    overflowing: box.content > box.frame + 1,
    onLayout: (event): void => {
      const frame = event.nativeEvent.layout.width;
      setBox((before) => (before.frame === frame ? before : { ...before, frame }));
    },
    onContentSizeChange: (content): void => {
      setBox((before) => (before.content === content ? before : { ...before, content }));
    },
  };
}

function useRoving(
  presets: readonly ColourStripSwatch[],
  active: boolean,
  pick: (id: string) => void,
): {
  readonly roving: number;
  readonly nodes: RefObject<(View | null)[]>;
  readonly focus: ReturnType<typeof useFocusedKeys>;
} {
  const count = presets.length;
  const [roving, setRoving] = useState(0);
  const nodes = useRef<(View | null)[]>([]);
  const focus = useFocusedKeys(active, (key) => {
    const target = stripKeyTarget(key, Math.min(roving, count - 1), count);
    if (target === null) {
      return false;
    }
    setRoving(target);
    nodes.current[target]?.focus();
    const swatch = presets[target];
    if (swatch !== undefined) {
      pick(swatch.id);
    }
    return true;
  });
  return { roving: Math.min(roving, Math.max(0, count - 1)), nodes, focus };
}

function Fade({ surface }: { readonly surface: 'surface-1' | 'surface-2' }): ReactNode {
  return (
    <View pointerEvents="none" className={cn('absolute inset-y-0 right-0 w-8', FADE[surface])} />
  );
}

interface PresetsProps {
  readonly label: string;
  readonly presets: readonly ColourStripSwatch[];
  readonly selectedId: string | null;
  readonly captioned: boolean;
  readonly disabled: boolean;
  readonly surface: 'surface-1' | 'surface-2';
  readonly idiom: Idiom;
  readonly onPick: (id: string) => void;
}

function Presets({
  label,
  presets,
  selectedId,
  captioned,
  disabled,
  surface,
  idiom,
  onPick,
}: PresetsProps): ReactNode {
  const overflow = useOverflow();
  const roving = useRoving(presets, idiom === 'pointer' && !disabled, onPick);
  return (
    <View className="min-w-0 flex-1" onLayout={overflow.onLayout}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={overflow.onContentSizeChange}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        onFocus={roving.focus.onFocus}
        onBlur={roving.focus.onBlur}
        contentContainerClassName="items-start px-1"
      >
        {presets.map((swatch, index) => (
          <Swatch
            key={swatch.id}
            swatch={swatch}
            selected={swatch.id === selectedId}
            tabStop={index === roving.roving}
            disabled={disabled}
            idiom={idiom}
            captioned={captioned}
            innerRef={(node) => {
              roving.nodes.current[index] = node;
            }}
            onPick={() => {
              selectionTick();
              roving.nodes.current[index]?.focus();
              onPick(swatch.id);
            }}
          />
        ))}
      </ScrollView>
      {overflow.overflowing ? <Fade surface={surface} /> : null}
    </View>
  );
}

export function ColourStrip({
  label,
  swatches,
  selectedId,
  current = null,
  density = 'full',
  surface = 'surface-1',
  disabled = false,
  focusRef,
  onPick,
  onMore,
}: ColourStripProps): ReactNode {
  const idiom = useIdiom();
  const layout = stripLayout(swatches, selectedId, current !== null, density);
  const captioned =
    density === 'full' && layout.presets.some((swatch) => swatch.caption !== undefined);
  return (
    <View ref={focusRef} className="flex-row items-center">
      {layout.pinnedCurrent && current !== null ? (
        <CurrentSwatch current={current} idiom={idiom} disabled={disabled} onMore={onMore} />
      ) : null}
      <Presets
        label={label}
        presets={layout.presets}
        selectedId={selectedId}
        captioned={captioned}
        disabled={disabled}
        surface={surface}
        idiom={idiom}
        onPick={onPick}
      />
      <Tap
        role="button"
        label="More colours"
        disabled={disabled}
        onPress={onMore}
        className={cn('items-center justify-center rounded-md', HIT[idiom])}
      >
        <MoreDot size={DOT_PX[idiom]} />
      </Tap>
    </View>
  );
}
