import type { BottleCareView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { percent } from '../../../format/number';
import { useMinute } from '../../../store/clock';
import { UvStrip } from '../charts/uv-strip';
import { UV_COLOUR, UV_LABEL } from '../model/bottle-colours';
import { freshnessOf, modeTotals, type ModeTotal } from '../model/care-model';

function Mode({ total }: { readonly total: ModeTotal }): ReactNode {
  const fill = { backgroundColor: useColour(UV_COLOUR[total.mode]) };
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={fill} className="size-3 rounded-full" />
      <Text variant="footnote" tone="variant">
        {UV_LABEL[total.mode]}
      </Text>
      <Text variant="footnote" className="tabular">
        {`${String(total.count)} · ${percent(total.share)}`}
      </Text>
    </View>
  );
}

export function UvCard({ care }: { readonly care: BottleCareView }): ReactNode {
  const state = freshnessOf(care, useMinute());
  return (
    <Card title="Cleaning" icon="sparkles">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge
          label={state.label}
          tone={state.fresh ? 'positive' : 'neutral'}
          icon={state.fresh ? 'circleCheck' : 'info'}
        />
        {state.next === null ? null : (
          <Text variant="footnote" tone="variant">
            {state.next}
          </Text>
        )}
      </View>
      <UvStrip days={care.uvDays} />
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {modeTotals(care).map((total) => (
          <Mode key={total.mode} total={total} />
        ))}
      </View>
    </Card>
  );
}
