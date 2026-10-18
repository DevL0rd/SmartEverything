import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { PageRings } from './composition-rings';
import type { Scale } from './use-scale';

const WEIGHT_ONLY = 'Weight only · stand barefoot for body composition';

export function CompositionCard({ scale }: { readonly scale: Scale }): ReactNode {
  const { latestCounted } = scale.facts;
  if (latestCounted === null) {
    return null;
  }
  const { composition } = latestCounted;
  return (
    <Card title="Body composition" icon="scale">
      {composition === null ? (
        <Text variant="callout" tone="variant">
          {WEIGHT_ONLY}
        </Text>
      ) : (
        <PageRings composition={composition} />
      )}
    </Card>
  );
}
