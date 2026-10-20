import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { LoadedQuery } from '../../../components/loaded-query';
import { Segmented } from '../../../components/segmented';
import { List } from '../../../components/section';
import type { Device } from '../../../store/state';
import type { ViewOf } from '../data/printer-api';
import { usePrinterView } from '../data/use-printer-view';
import {
  HISTORY_OPTIONS,
  RESULT_LABEL,
  historyRows,
  jobSubtitle,
  type HistoryFilter,
} from '../model/history-view';

function Rows({ view }: { readonly view: ViewOf<'jobs'> }): ReactNode {
  const rows = historyRows(view);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="printer"
        title="No jobs yet"
        body="Printed documents will be listed here."
      />
    );
  }
  return (
    <List>
      {rows.map((row) =>
        row.kind === 'job' ? (
          <ListRow
            key={row.key}
            icon="fileText"
            title={row.job.name ?? 'Document'}
            subtitle={jobSubtitle(row.job)}
            value={RESULT_LABEL[row.job.state]}
            iconTone={row.job.state === 'aborted' ? 'critical' : 'variant'}
          />
        ) : (
          <ListRow
            key={row.key}
            icon="warning"
            title="Not recorded"
            subtitle={row.text}
            wrapSubtitle
            iconTone="faint"
          />
        ),
      )}
    </List>
  );
}

export function HistorySection({ device }: { readonly device: Device }): ReactNode {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const jobs = usePrinterView(device, 'jobs', {
    state: filter === 'all' ? 'all' : filter,
    limit: 100,
  });
  return (
    <View className="gap-section-gap">
      <Segmented label="Show" options={HISTORY_OPTIONS} value={filter} fill onChange={setFilter} />
      <LoadedQuery query={jobs}>{(view) => <Rows view={view} />}</LoadedQuery>
    </View>
  );
}
