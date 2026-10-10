import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { latestSyncOf, useActiveSources } from '../data/sources';

export function HealthInfoRow(): ReactNode {
  const now = useMinute();
  const latest = latestSyncOf(useActiveSources());
  return (
    <ListRow
      icon="smartphone"
      title="Health Connect"
      subtitle="From your Android phone"
      value={latest === null ? 'Not synced yet' : `Synced ${relative(latest, now)}`}
    />
  );
}
