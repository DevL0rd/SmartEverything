import { useId, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { percent } from '../../../format/number';
import { sizeStyle } from './style';
import { pressureSharesLabel, type PressureShare } from '../model/stats-model';

const HEIGHT = 18;

function Hatch({ id }: { readonly id: string }): ReactNode {
  const stripe = useColour('critical');
  const base = useColour('surface-2');
  return (
    <Defs>
      <Pattern
        id={id}
        width={6}
        height={6}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <Rect width={6} height={6} fill={base} />
        <Rect width={3.2} height={6} fill={stripe} />
      </Pattern>
    </Defs>
  );
}

function Segments({
  shares,
  width,
  hatch,
}: {
  readonly shares: readonly PressureShare[];
  readonly width: number;
  readonly hatch: string;
}): ReactNode {
  const light = useColour('on-surface-variant');
  const good = useColour('positive');
  const fills: Readonly<Record<PressureShare['key'], string>> = {
    light,
    good,
    rest: good,
    hard: `url(#${hatch})`,
  };
  return shares.map((part, index) => {
    const from = shares.slice(0, index).reduce((sum, earlier) => sum + earlier.share * width, 0);
    const to = from + part.share * width;
    return (
      <Path
        key={part.key}
        d={`M${from.toFixed(1)} 0H${to.toFixed(1)}V${String(HEIGHT)}H${from.toFixed(1)}Z`}
        fill={fills[part.key]}
        fillOpacity={part.key === 'light' ? 0.6 : 1}
      />
    );
  });
}

export function ShareBar({ shares }: { readonly shares: readonly PressureShare[] }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const hatch = `share${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={pressureSharesLabel(shares)}
      className="gap-2"
    >
      <View
        aria-hidden
        onLayout={onLayout}
        className="overflow-hidden rounded-full"
        style={sizeStyle(width, HEIGHT)}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Hatch id={hatch} />
            <Segments shares={shares} width={width} hatch={hatch} />
          </Svg>
        ) : null}
      </View>
      <View aria-hidden className="flex-row flex-wrap gap-x-4 gap-y-1">
        {shares.map((part) => (
          <Text
            key={part.key}
            variant="caption"
            tone={part.key === 'hard' ? 'critical' : 'variant'}
            className="tabular"
          >
            {part.key === 'hard' ? 'Striped: ' : ''}
            {part.label} {percent(part.share)}
          </Text>
        ))}
      </View>
    </View>
  );
}
