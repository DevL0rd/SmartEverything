import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../../components/badge';
import { Text } from '../../../../components/text';
import type { Impact, ImpactTone } from './impact-model';

const TONE: Readonly<Record<ImpactTone, BadgeTone>> = {
  unchanged: 'neutral',
  compatible: 'positive',
  breaking: 'warning',
};

export function ImpactLabel({ impact }: { readonly impact: Impact }): ReactNode {
  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      className="gap-1.5 rounded-lg bg-surface-2 px-3 py-2"
    >
      <Badge label={impact.chip} tone={TONE[impact.tone]} />
      <Text variant="callout">{impact.message}</Text>
    </View>
  );
}
