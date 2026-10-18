import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { relative } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { latestSyncOf, useSources } from '../data/sources';

export function HealthInfoRow(): ReactNode {
  const latest = latestSyncOf(useSources());
  const synced = useMinuteOf((now) =>
    latest === null ? 'Not synced yet' : `Synced ${relative(latest, now)}`,
  );
  return (
    <ListRow
      icon="smartphone"
      title="Health Connect"
      subtitle="From your Android phone"
      value={synced}
    />
  );
}
