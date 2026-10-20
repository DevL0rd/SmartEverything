import type { BrushBrand, BrushMode } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { tintStyle } from '../charts/style';
import { brandUi } from '../brands';
import { modeLabel } from '../model/brush-model';

export function ModeChip({
  brand,
  mode,
}: {
  readonly brand: BrushBrand;
  readonly mode: BrushMode | null;
}): ReactNode {
  const dot = useColour(mode === null ? 'on-surface-faint' : brandUi(brand).modeColour(mode));
  return (
    <View
      accessible
      accessibilityLabel={`Mode ${modeLabel(mode)}`}
      className="min-h-6 flex-row items-center gap-1.5"
    >
      <View aria-hidden className="size-2.5 rounded-full" style={tintStyle(dot, 1)} />
      <Text variant="body-strong">{modeLabel(mode)}</Text>
    </View>
  );
}
