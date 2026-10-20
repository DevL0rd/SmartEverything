import type { BrushBrand } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { brandUi } from '../brands';
import { hardSecondsOf, placeRuns, type PlacedRun, type PressureRun } from '../model/session-model';

const HEIGHT = 20;
const HATCH = 'hard';
const SLIM = 4;

function rectPath(
  { x, width }: Pick<PlacedRun, 'x' | 'width'>,
  top: number,
  height: number,
): string {
  return `M${x.toFixed(1)} ${String(top)}h${width.toFixed(1)}v${String(height)}h${(-width).toFixed(1)}z`;
}

function Run({
  brand,
  placed,
}: {
  readonly brand: BrushBrand;
  readonly placed: PlacedRun;
}): ReactNode {
  const { pressure } = placed.run;
  const look = brandUi(brand).pressure[pressure];
  const fill = useColour(look.colour);
  if (pressure === 'too_high') {
    return <Path d={rectPath(placed, 0, HEIGHT)} fill={`url(#${HATCH})`} />;
  }
  return (
    <Path d={rectPath(placed, SLIM, HEIGHT - 2 * SLIM)} fill={fill} fillOpacity={look.opacity} />
  );
}

function Hatch({ brand }: { readonly brand: BrushBrand }): ReactNode {
  const hard = useColour(brandUi(brand).pressure.too_high.colour);
  const base = useColour('surface-2');
  return (
    <Defs>
      <Pattern
        id={HATCH}
        width={6}
        height={6}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <Rect width={6} height={6} fill={base} />
        <Rect width={3.2} height={6} fill={hard} />
      </Pattern>
    </Defs>
  );
}

export function PressureStrip({
  brand,
  runs,
  seconds,
}: {
  readonly brand: BrushBrand;
  readonly runs: readonly PressureRun[];
  readonly seconds: number;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const { pressure } = brandUi(brand);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Pressure over the brush: ${String(hardSecondsOf(runs))} seconds ${pressure.too_high.label.toLowerCase()}`}
      className="gap-1"
    >
      <View onLayout={onLayout} className="h-5">
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Hatch brand={brand} />
            {placeRuns(runs, seconds, width).map((placed, index) => (
              <Run key={index} brand={brand} placed={placed} />
            ))}
          </Svg>
        ) : null}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <Text variant="caption" tone="positive">
          {pressure.optimal.label}
        </Text>
        <Text variant="caption" tone="variant">
          Striped: {pressure.too_high.label.toLowerCase()}
        </Text>
        <Text variant="caption" tone="faint">
          Thin: {pressure.no_contact.label.toLowerCase()}
        </Text>
      </View>
    </View>
  );
}
