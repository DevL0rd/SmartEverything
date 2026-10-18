import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ScheduleRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import type { MenuItem } from '../../../components/menu';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { joinParts, plural } from '../../../format/text';
import { useMinute, useSecondOf } from '../../../store/clock';
import { cancelScheduled, removeScheduled, runScheduledNow } from './actions';
import { useHomeZone, useScheduledRows } from './use-scheduled';
import { canEdit, finishedOf, lateLine, runsLine, titleOf, upcomingOf, whenLine } from './view';
import { background } from '@smarteverything/logging';

function useRowMenu(row: ScheduleRow): MenuItem[] {
  const router = useRouter();
  if (!canEdit(row)) {
    return [
      {
        label: 'Remove',
        icon: 'trash',
        destructive: true,
        onPress: (): void => {
          background(removeScheduled(row), 'scheduled.remove_failed');
        },
      },
    ];
  }
  return [
    {
      label: 'Run now',
      icon: 'play',
      onPress: (): void => {
        runScheduledNow(row);
      },
    },
    {
      label: 'Edit',
      icon: 'pencil',
      onPress: (): void => {
        router.push(href.scheduledEdit(row.id));
      },
    },
    {
      label: 'Cancel',
      icon: 'close',
      destructive: true,
      onPress: (): void => {
        cancelScheduled(row);
      },
    },
  ];
}

const UpcomingRow = memo(function UpcomingRow({
  row,
  zone,
}: {
  readonly row: ScheduleRow;
  readonly zone: string;
}): ReactNode {
  const when = useSecondOf((now) => whenLine(row, now, zone));
  const menu = useRowMenu(row);
  return (
    <View className="flex-row items-center pr-2">
      <View className="min-w-0 flex-1">
        <ListRow
          title={titleOf(row)}
          subtitle={joinParts([when, runsLine(row)])}
          subtitleTone="primary"
          icon="timer"
          iconTone="primary"
          href={href.scheduledItem(row.id)}
          contextMenu={menu}
        />
      </View>
      <IconButton
        icon="close"
        label={`Cancel: ${titleOf(row)}`}
        onPress={() => {
          cancelScheduled(row);
        }}
      />
    </View>
  );
});

const FinishedRow = memo(function FinishedRow({
  row,
  zone,
}: {
  readonly row: ScheduleRow;
  readonly zone: string;
}): ReactNode {
  const now = useMinute();
  const menu = useRowMenu(row);
  return (
    <ListRow
      title={titleOf(row)}
      subtitle={joinParts([whenLine(row, now, zone), lateLine(row)])}
      subtitleTone={row.state === 'failed' ? 'critical' : 'variant'}
      icon={row.state === 'failed' ? 'alert' : 'check'}
      iconTone={row.state === 'failed' ? 'critical' : 'variant'}
      href={href.scheduledItem(row.id)}
      chevron
      contextMenu={menu}
    />
  );
});

function Lists({ rows }: { readonly rows: readonly ScheduleRow[] }): ReactNode {
  const zone = useHomeZone();
  const upcoming = upcomingOf(rows);
  const finished = finishedOf(rows);
  return (
    <>
      {upcoming.length === 0 ? null : (
        <List title="Coming up" inset>
          {upcoming.map((row) => (
            <UpcomingRow key={row.id} row={row} zone={zone} />
          ))}
        </List>
      )}
      {finished.length === 0 ? null : (
        <List title="Finished" footer="Finished ones are cleared after 7 days." inset>
          {finished.map((row) => (
            <FinishedRow key={row.id} row={row} zone={zone} />
          ))}
        </List>
      )}
    </>
  );
}

export function ScheduledScreen(): ReactNode {
  const router = useRouter();
  const rows = useScheduledRows();
  const upcoming = upcomingOf(rows).length;
  const create = (): void => {
    router.push(href.scheduledNew());
  };
  return (
    <Screen
      maxWidth="reading"
      header={
        <PageHeader
          title="One-off timers"
          {...(upcoming === 0 ? {} : { subtitle: `${plural(upcoming, 'action')} coming up` })}
        />
      }
      primaryAction={{ label: 'Schedule', icon: 'plus', onPress: create }}
    >
      {rows.length === 0 ? (
        <EmptyState
          icon="timer"
          title="Nothing scheduled"
          body="Do something once, later: turn a device off in a few minutes from its menu, or ask the assistant."
          action={<Button label="Schedule something" icon="plus" onPress={create} />}
        />
      ) : (
        <Lists rows={rows} />
      )}
    </Screen>
  );
}
