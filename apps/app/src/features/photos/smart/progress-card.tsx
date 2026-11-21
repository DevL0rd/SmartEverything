import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoAiStatus } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { Arc, ProgressBar, type ArcTick } from '../../../components/charts';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useMoney } from '../../region';
import { photosLine, spendOf, stageRingsOf, type StageRing } from './model';

const RING_SIZE = 72;

const RING_THICKNESS = 8;

const RING_FRAME = { width: RING_SIZE, height: RING_SIZE };

function failedTicksOf(ring: StageRing): readonly ArcTick[] {
  if (ring.failedShare === 0) return [];
  return [
    {
      start: ring.progress * 360,
      sweep: ring.failedShare * 360,
      colour: 'critical',
      thickness: RING_THICKNESS,
    },
  ];
}

function RingTile({ ring }: { readonly ring: StageRing }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${ring.title}: ${count(ring.done)} of ${count(ring.total)}, ${ring.line}`}
      className="min-w-56 flex-1 flex-row items-center gap-3"
    >
      <View style={RING_FRAME} className="items-center justify-center">
        <View className="absolute inset-0">
          <Arc
            value={ring.progress}
            size={RING_SIZE}
            thickness={RING_THICKNESS}
            colour={ring.colour}
            tinted
            ticks={failedTicksOf(ring)}
            ticking={false}
          />
        </View>
        <Text variant="footnote" className="tabular-nums font-sans-medium">
          {ring.label}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {ring.title}
        </Text>
        <Text variant="footnote" className="tabular-nums" numberOfLines={1}>
          {`${count(ring.done)} of ${count(ring.total)}`}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={2}>
          {ring.line}
        </Text>
      </View>
    </View>
  );
}

function Spend({ status }: { readonly status: PhotoAiStatus }): ReactNode {
  const money = useMoney();
  const spend = spendOf(status);
  if (spend.planned === 0) return null;
  return (
    <View className="gap-2 border-t border-outline-variant pt-3">
      <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
        <Text variant="body-strong" className="tabular-nums">
          {`${money.cost(spend.spent)} spent`}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {status.estimateMicros === 0
            ? 'Nothing left to pay for'
            : `About ${money.cost(status.estimateMicros)} for the rest`}
        </Text>
      </View>
      <ProgressBar
        progress={spend.progress}
        colour="viz-3"
        label={`Spent ${money.cost(spend.spent)} of about ${money.cost(spend.planned)}`}
        ticking={false}
      />
    </View>
  );
}

export function ProgressCard({ status }: { readonly status: PhotoAiStatus }): ReactNode {
  const rings = stageRingsOf(status);
  if (rings.length === 0) return null;
  return (
    <Card
      title="Progress"
      icon="activity"
      metadata={
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {photosLine(status.total)}
        </Text>
      }
    >
      <View className="gap-4">
        <View className="flex-row flex-wrap gap-4">
          {rings.map((ring) => (
            <RingTile key={ring.stage} ring={ring} />
          ))}
        </View>
        {status.smartSearch ? <Spend status={status} /> : null}
      </View>
    </Card>
  );
}
