import { useId, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { BREATHE, loopStyle } from '../../../design/loops';
import { boxStyle } from '../../toothbrush/charts/style';
import { partialLabel, toothFills, type Quarter, type QuarterState } from '../model/arch-model';
import { ARCH_BOX, QUARTER_SHAPES, frontOf, toothPath } from '../model/arch-geometry';

const GLOW_MS = 1400;

export const ARCH_RATIO = ARCH_BOX.width / ARCH_BOX.height;

export function archHeight(width: number): number {
  return Math.round(width / ARCH_RATIO);
}

function isLit(state: QuarterState): boolean {
  return state === 'done' || state === 'current' || state === 'partial';
}

function Teeth({
  quarter,
  hatch,
}: {
  readonly quarter: Quarter;
  readonly hatch: string;
}): ReactNode {
  const shape = QUARTER_SHAPES[quarter.index - 1];
  const lit = useColour(quarter.state === 'partial' ? 'warning' : 'positive');
  const edge = useColour(quarter.state === 'missed' ? 'warning' : 'outline');
  const base = useColour('surface-2');
  if (shape === undefined) {
    return null;
  }
  const fills = isLit(quarter.state) ? toothFills(quarter.fill) : shape.teeth.map(() => 0);
  return (
    <G>
      {shape.teeth.map((tooth, position) => (
        <G key={position}>
          <Path
            d={toothPath(tooth)}
            fill={quarter.state === 'missed' ? `url(#${hatch})` : base}
            stroke={edge}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          {(fills[position] ?? 0) > 0 ? (
            <Path
              d={toothPath(tooth, fills[position] ?? 0)}
              fill={lit}
              stroke={lit}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          ) : null}
        </G>
      ))}
    </G>
  );
}

function Outline({ quarter }: { readonly quarter: Quarter }): ReactNode {
  const ink = useColour('on-surface');
  const shape = QUARTER_SHAPES[quarter.index - 1];
  if (shape === undefined) {
    return null;
  }
  return (
    <G>
      {shape.teeth.map((tooth, position) => (
        <Path
          key={position}
          d={toothPath(tooth)}
          fill="none"
          stroke={ink}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
      ))}
    </G>
  );
}

function Marker({ quarter }: { readonly quarter: Quarter }): ReactNode {
  const ink = useColour('on-surface');
  const ring = useColour('bg');
  const shape = QUARTER_SHAPES[quarter.index - 1];
  if (shape === undefined) {
    return null;
  }
  const [x, y] = frontOf(shape.teeth, toothFills(quarter.fill));
  return <Circle cx={x} cy={y} r={4.2} fill={ink} stroke={ring} strokeWidth={1.4} />;
}

function Check({ quarter }: { readonly quarter: Quarter }): ReactNode {
  const ink = useColour('bg');
  const shape = QUARTER_SHAPES[quarter.index - 1];
  const tooth = shape?.teeth[3];
  if (tooth === undefined) {
    return null;
  }
  const [x, y] = frontOf([tooth], [0.5]);
  return (
    <Path
      d={`M${(x - 3.4).toFixed(1)} ${y.toFixed(1)}L${(x - 1).toFixed(1)} ${(y + 2.6).toFixed(1)}L${(x + 3.6).toFixed(1)} ${(y - 2.8).toFixed(1)}`}
      fill="none"
      stroke={ink}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Hatch({ id }: { readonly id: string }): ReactNode {
  const stripe = useColour('warning');
  const base = useColour('surface-2');
  return (
    <Defs>
      <Pattern
        id={id}
        width={5}
        height={5}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <Rect width={5} height={5} fill={base} />
        <Rect width={2.4} height={5} fill={stripe} />
      </Pattern>
    </Defs>
  );
}

function Glow({
  quarter,
  width,
  moving,
}: {
  readonly quarter: Quarter;
  readonly width: number;
  readonly moving: boolean;
}): ReactNode {
  const colour = useColour('positive');
  const shape = QUARTER_SHAPES[quarter.index - 1];
  const motion = loopStyle({ name: BREATHE, ms: GLOW_MS, alternate: true }, moving);
  if (shape === undefined || motion === null) {
    return null;
  }
  return (
    <Animated.View
      pointerEvents="none"
      renderToHardwareTextureAndroid
      style={[StyleSheet.absoluteFill, motion]}
    >
      <Svg
        width={width}
        height={archHeight(width)}
        viewBox={`0 0 ${String(ARCH_BOX.width)} ${String(ARCH_BOX.height)}`}
      >
        {shape.teeth.map((tooth, position) => (
          <Path
            key={position}
            d={toothPath(tooth)}
            fill="none"
            stroke={colour}
            strokeOpacity={0.5}
            strokeWidth={6}
            strokeLinejoin="round"
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

function ArchSvg({
  quarters,
  width,
}: {
  readonly quarters: readonly Quarter[];
  readonly width: number;
}): ReactNode {
  const hatch = `hatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const current = quarters.find((quarter) => quarter.state === 'current') ?? null;
  return (
    <Svg
      width={width}
      height={archHeight(width)}
      viewBox={`0 0 ${String(ARCH_BOX.width)} ${String(ARCH_BOX.height)}`}
    >
      <Hatch id={hatch} />
      {quarters.map((quarter) => (
        <Teeth key={quarter.index} quarter={quarter} hatch={hatch} />
      ))}
      {current === null ? null : <Outline quarter={current} />}
      {quarters
        .filter((quarter) => quarter.state === 'done')
        .map((quarter) => (
          <Check key={quarter.index} quarter={quarter} />
        ))}
      {current === null ? null : <Marker quarter={current} />}
    </Svg>
  );
}

export function QuadrantArch({
  quarters,
  big,
  small,
  width,
  moving,
  label,
}: {
  readonly quarters: readonly Quarter[];
  readonly big: string;
  readonly small: string;
  readonly width: number;
  readonly moving: boolean;
  readonly label: string;
}): ReactNode {
  const current = quarters.find((quarter) => quarter.state === 'current') ?? null;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={boxStyle(width, archHeight(width))}
      className="items-center justify-center"
    >
      <ArchSvg quarters={quarters} width={width} />
      {current === null ? null : <Glow quarter={current} width={width} moving={moving} />}
      <View aria-hidden pointerEvents="none" className="absolute items-center px-6">
        <Text variant={width >= 250 ? 'title-1' : 'title-2'} className="tabular">
          {big}
        </Text>
        <Text variant="caption" tone="variant" align="center" className="tabular">
          {small}
        </Text>
      </View>
    </View>
  );
}

export function QuarterNotes({ quarters }: { readonly quarters: readonly Quarter[] }): ReactNode {
  const notes = quarters.flatMap((quarter) => {
    const partial = partialLabel(quarter);
    if (partial !== null) {
      return [
        { key: quarter.index, text: `${quarter.name}: ${partial}`, tone: 'warning' as const },
      ];
    }
    return quarter.state === 'missed'
      ? [{ key: quarter.index, text: `${quarter.name}: not reached`, tone: 'warning' as const }]
      : [];
  });
  if (notes.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
      {notes.map((note) => (
        <Text key={note.key} variant="caption" tone={note.tone} className="tabular">
          {note.text}
        </Text>
      ))}
    </View>
  );
}
