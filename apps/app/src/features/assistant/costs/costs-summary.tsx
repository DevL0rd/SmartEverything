import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { UsageSummary } from '@smarteverything/domain';
import { Sparkline } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import type { IconName } from '../../../components/icon-glyphs';
import { Text } from '../../../components/text';
import { CostCard } from './cost-card';
import type { ColourRole } from '../../../design/tokens';
import { count } from '../../../format/number';
import { costText } from '../data/cost';
import type { CostWindow } from './costs-range';
import { EstimateNote } from './estimate-note';

interface TileProps {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly value: string;
  readonly caption: string;
  readonly trail?: readonly number[];
  readonly extra?: ReactNode;
}

function Tile({ title, icon, accent, value, caption, trail, extra }: TileProps): ReactNode {
  return (
    <CostCard title={title} icon={icon} accent={accent}>
      <View className="gap-2">
        <View className="gap-0.5">
          <Figure value={value} size="l" />
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {caption}
          </Text>
          {extra}
        </View>
        {trail === undefined || trail.length < 2 ? null : (
          <Sparkline
            points={trail.map((v, index) => ({ t: index, v }))}
            colour={accent}
            height={28}
            area
          />
        )}
      </View>
    </CostCard>
  );
}

export function SummaryTiles({
  summary,
  window,
  rangeName,
}: {
  readonly summary: UsageSummary;
  readonly window: CostWindow;
  readonly rangeName: string;
}): ReactNode {
  const { sum } = summary.totals;
  const trail = summary.series.points.map((point) => point.cost_micros);
  return (
    <>
      <Tile
        title="Total"
        icon="gauge"
        accent="viz-1"
        value={costText(sum.cost_micros)}
        caption={rangeName}
        trail={trail}
        extra={<EstimateNote micros={sum.pending_micros} />}
      />
      <Tile
        title="Requests"
        icon="activity"
        accent="viz-2"
        value={count(sum.count)}
        caption={rangeName}
        trail={summary.series.points.map((point) => point.count)}
      />
      <Tile
        title="Per day"
        icon="calendar"
        accent="viz-3"
        value={costText(Math.round(sum.cost_micros / Math.max(1, window.days)))}
        caption={`Average over ${String(window.days)} ${window.days === 1 ? 'day' : 'days'}`}
      />
    </>
  );
}
