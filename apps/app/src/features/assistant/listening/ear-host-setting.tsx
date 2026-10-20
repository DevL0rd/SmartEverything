import type { ReactNode } from 'react';
import { LoadedQuery } from '../../../components/loaded-query';
import { EarHostCard } from './ear-host-card';
import { useHubOffline, useListeningView } from './listening-data';

export function EarHostSetting(): ReactNode {
  const query = useListeningView();
  const offline = useHubOffline();
  return (
    <LoadedQuery query={query}>
      {(view) => <EarHostCard view={view} offline={offline} />}
    </LoadedQuery>
  );
}
