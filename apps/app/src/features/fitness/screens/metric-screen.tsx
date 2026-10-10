import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { entryIdOfRecord, type HealthRecord } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { HeaderAction } from '../../../components/page-header';
import { logFormOf } from '../../health-log';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { joinParts } from '../../../format/text';
import { FitnessToolbar } from '../components/fitness-toolbar';
import { MetricSection } from '../components/metric-section';
import { useFitnessParams } from '../data/day';
import { useSeries } from '../data/series';
import { isSeriesKey, seriesOf } from '../model/catalogue';
import { recordSummary } from '../model/format';
import { newestFirst, startOf } from '../model/records';
import type { SeriesSpec } from '../model/series-spec';
import { appName } from '../model/sources';
import { clock, dayKeyOf, dayLabel, startOfDayKey } from '../../../format/time';
import { RANGES, windowOf, type Window } from '../model/window';

const SHOWN_RECORDS = 30;

function RecordRow({
  record,
  today,
}: {
  readonly record: HealthRecord;
  readonly today: string;
}): ReactNode {
  const at = startOf(record);
  const edit = editHref(record, at);
  return (
    <ListRow
      title={recordSummary(record)}
      subtitle={joinParts([
        `${dayLabel(at, startOfDayKey(today))} ${clock(at)}`,
        appName(record.sourceApp),
      ])}
      {...(edit === null ? {} : { href: edit, chevron: true })}
    />
  );
}

function editHref(record: HealthRecord, at: number): Href | null {
  const entryId = entryIdOfRecord(record.recordId);
  if (entryId === null) {
    return null;
  }
  if (record.type === 'Nutrition' || record.type === 'Hydration') {
    return href.fitnessPage('nutrition', { day: dayKeyOf(at) });
  }
  return logFormOf(record.type) === null
    ? null
    : href.logHealth(record.type, { entry: entryId, at: String(at) });
}

function logAction(spec: SeriesSpec): HeaderAction | null {
  if (spec.type === 'Nutrition' || spec.type === 'Hydration') {
    return { icon: 'plus', label: 'Add food', href: href.logFood() };
  }
  return logFormOf(spec.type) === null
    ? null
    : { icon: 'plus', label: 'Log', href: href.logHealth(spec.type) };
}

function Records({
  spec,
  window,
  today,
}: {
  readonly spec: SeriesSpec;
  readonly window: Window;
  readonly today: string;
}): ReactNode {
  const view = useSeries(spec, window, true);
  const records = newestFirst(view.records).slice(0, SHOWN_RECORDS);
  if (records.length === 0) {
    return null;
  }
  return (
    <List title="Entries" inset>
      {records.map((record) => (
        <RecordRow key={record.recordId} record={record} today={today} />
      ))}
    </List>
  );
}

function MetricBody({ spec }: { readonly spec: SeriesSpec }): ReactNode {
  const { day, today, range } = useFitnessParams(spec.daily === null ? 'month' : 'week');
  const window = windowOf(range, day);
  return (
    <>
      <FitnessToolbar day={day} today={today} range={range} ranges={RANGES} />
      <MetricSection spec={spec} window={window} link={false} />
      <Records spec={spec} window={window} today={today} />
    </>
  );
}

export function MetricScreen(): ReactNode {
  const { metric } = useLocalSearchParams<{ metric: string }>();
  const known = isSeriesKey(metric);
  const log = known ? logAction(seriesOf(metric)) : null;
  return (
    <Screen
      header={
        <PageHeader
          title={known ? seriesOf(metric).label : 'Health data'}
          actions={log === null ? [] : [log]}
        />
      }
      maxWidth="detail"
    >
      {known ? (
        <MetricBody spec={seriesOf(metric)} />
      ) : (
        <EmptyState
          icon="fitness"
          title="Page not found"
          body="This kind of health data does not exist."
        />
      )}
    </Screen>
  );
}
