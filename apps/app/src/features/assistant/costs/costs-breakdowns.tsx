import type { ReactNode } from 'react';
import type { UsageTotals } from '@smarteverything/domain';
import { ErrorState } from '../../../components/error-state';
import { Grid } from '../../../components/grid';
import { Skeleton } from '../../../components/skeleton';
import { BreakdownCard } from './breakdown-card';
import { DIMENSION_INFO } from './costs-dimensions';
import type { CostDimension, CostFilters } from './costs-params';
import { useCostTotals } from './costs-data';
import type { CostWindow } from './costs-range';

const MIN_CARD = 320;

const CARDS: readonly CostDimension[] = ['chat', 'person', 'model', 'work'];

function cardsFor(totals: UsageTotals, filters: CostFilters): readonly CostDimension[] {
  return CARDS.filter((dimension) => {
    const parts = totals.by[DIMENSION_INFO[dimension].split];
    return filters[dimension] === undefined && (dimension !== 'person' || parts.length > 1);
  });
}

export interface CostBreakdownsProps {
  readonly window: CostWindow;
  readonly filters: CostFilters;
  readonly onFilter: (dimension: CostDimension, key: string) => void;
}

export function CostBreakdowns({ window, filters, onFilter }: CostBreakdownsProps): ReactNode {
  const totals = useCostTotals(window, filters);
  if (totals.isError) {
    return <ErrorState error={totals.error} retry={() => void totals.refetch()} />;
  }
  if (totals.data === undefined) {
    return (
      <Grid minItemWidth={MIN_CARD} maxColumns={2}>
        <Skeleton shape="block" className="h-64" />
        <Skeleton shape="block" className="h-64" />
      </Grid>
    );
  }
  const data = totals.data;
  return (
    <Grid minItemWidth={MIN_CARD} maxColumns={2}>
      {cardsFor(data, filters).map((dimension) => (
        <BreakdownCard
          key={dimension}
          dimension={dimension}
          parts={data.by[DIMENSION_INFO[dimension].split]}
          onFilter={onFilter}
        />
      ))}
    </Grid>
  );
}
