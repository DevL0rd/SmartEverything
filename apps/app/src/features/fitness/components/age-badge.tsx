import type { ReactNode } from 'react';
import { Badge } from '../../../components/badge';
import { freshnessOf } from '../model/freshness';

export function AgeBadge({
  day,
  selected,
}: {
  readonly day: string;
  readonly selected: string;
}): ReactNode {
  const freshness = freshnessOf(day, selected);
  if (freshness.current) {
    return null;
  }
  return <Badge label={freshness.label} tone={freshness.stale ? 'warning' : 'neutral'} />;
}
