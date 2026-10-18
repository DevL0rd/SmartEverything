import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Arc } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import type { ColourRole } from '../../../design/tokens';
import type { FaceTone } from '../model/face-model';

const SIZE = 104;
const THICKNESS = 10;

const ARC_COLOUR: Readonly<Record<FaceTone, ColourRole>> = {
  positive: 'positive',
  info: 'primary',
  warning: 'warning',
  critical: 'critical',
  neutral: 'primary',
};

export function BatteryArc({
  level,
  tone,
  stale,
}: {
  readonly level: number | null;
  readonly tone: FaceTone;
  readonly stale: boolean;
}): ReactNode {
  if (level === null) return null;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Battery ${String(level)} percent`}
      className="size-26 items-center justify-center"
    >
      <View className="absolute inset-0">
        <Arc
          value={level / 100}
          size={SIZE}
          thickness={THICKNESS}
          colour={stale ? 'on-surface-faint' : ARC_COLOUR[tone]}
          trackColour="surface-3"
        />
      </View>
      <View className="items-center">
        <Figure value={String(level)} size="m" stale={stale} />
        <Text variant="caption" tone="variant">
          %
        </Text>
      </View>
    </View>
  );
}
