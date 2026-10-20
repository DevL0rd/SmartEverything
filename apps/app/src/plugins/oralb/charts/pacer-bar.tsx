import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { fillStyle } from '../../toothbrush/charts/style';
import type { PacerBar as PacerModel } from '../model/care-model';
import { clockText } from '../../toothbrush/model/brush-model';

export function PacerBar({ bar }: { readonly bar: PacerModel }): ReactNode {
  const fill = useColour('primary');
  const idle = useColour('surface-3');
  return (
    <View
      accessible
      accessibilityLabel={
        bar.segments.length === 0
          ? 'Pacer off'
          : `Pacer: ${bar.segments.map((seconds) => `${String(seconds)} seconds`).join(', ')}, ${bar.label}`
      }
      className="gap-1.5"
    >
      <View aria-hidden className="h-3 flex-row gap-1">
        {bar.segments.length === 0 ? (
          <View style={fillStyle(1, idle, 1)} className="rounded-full" />
        ) : (
          bar.segments.map((seconds, index) => (
            <View key={index} style={fillStyle(seconds, fill, 0.9)} className="rounded-full" />
          ))
        )}
      </View>
      <View aria-hidden className="flex-row items-center justify-between">
        <Text variant="caption" tone="variant">
          {bar.segments.length === 0
            ? 'No quarter timing'
            : bar.segments.map((seconds) => clockText(seconds)).join(' · ')}
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {bar.label}
        </Text>
      </View>
    </View>
  );
}
