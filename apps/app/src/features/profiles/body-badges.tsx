import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { BodyComposition } from '@smarteverything/domain';
import { Badge } from '../../components/badge';
import { BODY_TYPE_LABELS } from './composition-metrics';

export function BodyBadges({ composition }: { readonly composition: BodyComposition }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Badge label={`Body score ${String(composition.body_score)}`} tone="primary" />
      <Badge label={BODY_TYPE_LABELS[composition.body_type]} tone="neutral" />
      <Badge label={`Body age ${String(composition.body_age)}`} tone="neutral" />
    </View>
  );
}
