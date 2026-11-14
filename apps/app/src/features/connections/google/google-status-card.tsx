import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { GoogleAccountRow, GoogleSyncLogEntry } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Bars } from '../../../components/charts/bars';
import { MetricStrip, type MetricItem } from '../../../components/metric-strip';
import { Text } from '../../../components/text';
import { plural } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { useSyncNow } from './google-actions';
import { GoogleMark } from './google-mark';
import { weekSummary, type WeekSummary } from './google-log';
import { statusDot, syncedText } from './google-status';

const STRIP_COLUMNS = { compact: 3, medium: 3, expanded: 3 } as const;

const CHART_HEIGHT = 56;

function Heading({ account }: { readonly account: GoogleAccountRow }): ReactNode {
  const sync = useSyncNow(account.profile_id);
  const synced = syncedText(account);
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <GoogleMark dot={statusDot(account)} size={40} />
      <View className="min-w-40 flex-1">
        <Text variant="body-strong">Linked · Calendar and Tasks</Text>
        {account.email === null ? null : (
          <Text variant="callout" numberOfLines={1}>
            {account.email}
          </Text>
        )}
        <Text variant="footnote" tone="variant" className="tabular">
          {synced === null ? 'Not synced yet' : synced.charAt(0).toUpperCase() + synced.slice(1)}
        </Text>
      </View>
      <Button
        label="Sync now"
        icon="refresh"
        variant="tonal"
        loading={sync.busy}
        onPress={sync.run}
      />
    </View>
  );
}

function metrics(calendars: number, lists: number, week: WeekSummary): MetricItem[] {
  return [
    { key: 'calendars', label: 'Calendars', value: String(calendars) },
    { key: 'lists', label: 'Task lists', value: String(lists) },
    { key: 'changes', label: 'This week', value: String(week.changes), unit: 'changes' },
  ];
}

function WeekChart({ week }: { readonly week: WeekSummary }): ReactNode {
  return (
    <View className="gap-1">
      <View className="flex-row justify-between gap-2">
        <Text variant="footnote" tone="variant">
          Changes synced per day
        </Text>
        {week.conflicts === 0 ? null : (
          <Text variant="footnote" tone="variant" className="tabular">
            {`${plural(week.conflicts, 'conflict')} kept`}
          </Text>
        )}
      </View>
      <Bars
        bars={week.days}
        colour="primary"
        label={`Changes synced per day, last 7 days, ${plural(week.changes, 'change')} in all`}
        height={CHART_HEIGHT}
        highlightKey={week.today}
      />
    </View>
  );
}

export function GoogleStatusCard({
  account,
  entries,
  calendars,
  lists,
}: {
  readonly account: GoogleAccountRow;
  readonly entries: readonly GoogleSyncLogEntry[];
  readonly calendars: number;
  readonly lists: number;
}): ReactNode {
  const week = weekSummary(entries, useMinute());
  return (
    <Card>
      <Heading account={account} />
      <MetricStrip items={metrics(calendars, lists, week)} columns={STRIP_COLUMNS} />
      <WeekChart week={week} />
    </Card>
  );
}
