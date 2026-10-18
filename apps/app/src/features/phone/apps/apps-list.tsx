import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { useRevealed } from '../../../components/show-more';
import { Badge } from '../../../components/badge';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { matchingApps, type AppRow } from '../model/apps-model';
import { AppIcon } from './app-icon';

function lastUsedText(row: AppRow, now: number): string {
  return row.lastUsedAt === null ? 'Not used lately' : `Last used ${relative(row.lastUsedAt, now)}`;
}

function AppListRow({
  row,
  now,
  notifications,
  onPick,
}: {
  readonly row: AppRow;
  readonly now: number;
  readonly notifications: number;
  readonly onPick: (row: AppRow) => void;
}): ReactNode {
  return (
    <ListRow
      title={row.label}
      subtitle={lastUsedText(row, now)}
      label={`${row.label}, ${lastUsedText(row, now)}`}
      leading={<AppIcon label={row.label} iconHash={row.iconHash} size="l" />}
      trailing={
        <View className="flex-row items-center gap-2">
          {notifications > 0 ? <Badge label={String(notifications)} icon="bell" /> : null}
          <Icon name="chevronRight" size={16} tone="faint" />
        </View>
      }
      onPress={() => {
        onPick(row);
      }}
    />
  );
}

function Rows({
  rows,
  total,
  notificationsOf,
  onPick,
}: {
  readonly rows: readonly AppRow[];
  readonly total: number;
  readonly notificationsOf: (app: string) => number;
  readonly onPick: (row: AppRow) => void;
}): ReactNode {
  const now = useMinute();
  const { shown, more } = useRevealed(rows);
  return (
    <List title="All apps" caption={`${String(rows.length)} of ${String(total)}`}>
      {shown.map((row) => (
        <AppListRow
          key={row.package}
          row={row}
          now={now}
          notifications={notificationsOf(row.package)}
          onPick={onPick}
        />
      ))}
      {more}
    </List>
  );
}

export function AppsList({
  rows,
  query,
  onQuery,
  notificationsOf,
  onPick,
}: {
  readonly rows: readonly AppRow[];
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly notificationsOf: (app: string) => number;
  readonly onPick: (row: AppRow) => void;
}): ReactNode {
  const found = matchingApps(rows, query);
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon="grid"
        title="No apps listed yet"
        body="The phone has not sent its app list."
      />
    );
  }
  return (
    <View className="gap-3">
      <SearchField value={query} onChange={onQuery} placeholder="Search apps" variant="field" />
      {found.length === 0 ? (
        <EmptyState
          compact
          icon="search"
          title="No app matches"
          body={`Nothing is called “${query.trim()}”. Try a shorter name.`}
        />
      ) : (
        <Rows rows={found} total={rows.length} notificationsOf={notificationsOf} onPick={onPick} />
      )}
    </View>
  );
}
