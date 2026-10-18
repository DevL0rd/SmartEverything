import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { BodyComposition } from '@smarteverything/domain';
import { Arc } from '../../../components/charts';
import { Text } from '../../../components/text';
import { BandLabel } from '../../profiles';
import { CARD_RING_KEYS, ringsOf, type RingFact } from './rings-model';

const MINI_PX = 32;
const MINI_THICKNESS = 4;
const PAGE_PX = 72;
const PAGE_THICKNESS = 8;

export function MiniRings({ composition }: { readonly composition: BodyComposition }): ReactNode {
  const rings = ringsOf(composition, CARD_RING_KEYS);
  return (
    <View className="flex-row items-center gap-3" pointerEvents="none">
      {rings.map((ring) => (
        <View key={ring.key} className="min-w-0 flex-1 flex-row items-center gap-1.5">
          <Arc
            value={ring.fill}
            size={MINI_PX}
            thickness={MINI_THICKNESS}
            colour={ring.colour}
            trackColour="outline-variant"
          />
          <View className="min-w-0 shrink">
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {ring.label}
            </Text>
            <Text variant="caption" className="tabular" numberOfLines={1}>
              {ring.text}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PageRing({
  ring,
  composition,
}: {
  readonly ring: RingFact;
  readonly composition: BodyComposition;
}): ReactNode {
  const band = composition.bands[ring.band];
  return (
    <View
      accessible
      accessibilityLabel={ring.spoken}
      className="min-w-24 flex-1 items-center gap-1"
    >
      <View className="items-center justify-center">
        <Arc
          value={ring.fill}
          size={PAGE_PX}
          thickness={PAGE_THICKNESS}
          colour={ring.colour}
          trackColour="outline-variant"
        />
        <View className="absolute inset-0 items-center justify-center">
          <Text variant="footnote" className="tabular">
            {ring.text}
          </Text>
        </View>
      </View>
      <Text variant="callout" numberOfLines={1}>
        {ring.label}
      </Text>
      {band === undefined ? null : <BandLabel metric={ring.band} band={band} />}
    </View>
  );
}

export function PageRings({ composition }: { readonly composition: BodyComposition }): ReactNode {
  return (
    <View className="flex-row flex-wrap justify-between gap-y-4">
      {ringsOf(composition).map((ring) => (
        <PageRing key={ring.key} ring={ring} composition={composition} />
      ))}
    </View>
  );
}
