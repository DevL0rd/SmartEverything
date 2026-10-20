import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import type { ScheduleRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import type { MenuItem } from '../../../components/menu';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { joinParts } from '../../../format/text';
import { moment } from '../../../format/time';
import { useSecondOf } from '../../../store/clock';
import { NotFound } from '../shared/not-found';
import { cancelScheduled, removeScheduled, runScheduledNow } from './actions';
import { StepRows } from './step-rows';
import { useHomeZone, useScheduleRow } from './use-scheduled';
import {
  STATE_LOOK,
  canEdit,
  countdown,
  lateLine,
  runsLine,
  secondsLeft,
  titleOf,
  whenLine,
} from './view';
import { background } from '@smarteverything/logging';

const PARAMS = z.object({ scheduleId: z.string() });

interface Commands {
  readonly runNow: () => void;
  readonly edit: () => void;
  readonly cancel: () => void;
  readonly remove: () => void;
}

function useCommands(row: ScheduleRow): Commands {
  const router = useRouter();
  return {
    runNow: (): void => {
      runScheduledNow(row);
    },
    edit: (): void => {
      router.push(href.scheduledEdit(row.id));
    },
    cancel: (): void => {
      cancelScheduled(row);
    },
    remove: (): void => {
      background(
        removeScheduled(row).then((removed) => {
          if (removed) {
            router.back();
          }
        }),
        'scheduled.remove_failed',
      );
    },
  };
}

function Summary({ row, zone }: { readonly row: ScheduleRow; readonly zone: string }): ReactNode {
  const look = STATE_LOOK[row.state];
  const left = useSecondOf((now) => {
    const seconds = canEdit(row) ? secondsLeft(row, now) : null;
    return seconds === null ? null : countdown(seconds);
  });
  const when = useSecondOf((now) => whenLine(row, now, zone));
  const created = useSecondOf((now) => moment(row.created_at, now, zone));
  return (
    <Card>
      <View className="gap-2">
        <View className="flex-row">
          <Badge label={look.label} tone={look.tone} />
        </View>
        {left === null ? null : (
          <Text variant="large-title" tone="primary">
            {left}
          </Text>
        )}
        <Text variant="body">{when}</Text>
        <Text variant="footnote" tone="variant">
          {joinParts([
            runsLine(row),
            lateLine(row),
            `Scheduled ${row.via === 'assistant' ? 'by the assistant' : 'in the app'} ${created}`,
            row.confirmed_at === null ? null : 'Confirmed when scheduled',
          ])}
        </Text>
      </View>
    </Card>
  );
}

function Buttons({
  row,
  commands,
}: {
  readonly row: ScheduleRow;
  readonly commands: Commands;
}): ReactNode {
  if (!canEdit(row)) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap gap-3">
      <Button label="Run now" icon="play" variant="tonal" onPress={commands.runNow} />
      <Button label="Edit" icon="pencil" variant="tonal" onPress={commands.edit} />
      <Button label="Cancel" icon="close" variant="destructive" onPress={commands.cancel} />
    </View>
  );
}

function Detail({ row }: { readonly row: ScheduleRow }): ReactNode {
  const zone = useHomeZone();
  const touch = useIdiom() === 'touch';
  const commands = useCommands(row);
  const editable = canEdit(row);
  const actions: HeaderAction[] =
    touch || !editable
      ? []
      : [
          { icon: 'play', label: 'Run now', onPress: commands.runNow },
          { icon: 'pencil', label: 'Edit', onPress: commands.edit },
          { icon: 'close', label: 'Cancel', onPress: commands.cancel },
        ];
  const overflow: MenuItem[] = editable
    ? []
    : [{ label: 'Remove', icon: 'trash', destructive: true, onPress: commands.remove }];
  return (
    <Screen
      maxWidth="reading"
      header={
        <PageHeader
          title={titleOf(row)}
          subtitle={STATE_LOOK[row.state].label}
          actions={actions}
          overflow={overflow}
        />
      }
    >
      <Summary row={row} zone={zone} />
      {touch ? <Buttons row={row} commands={commands} /> : null}
      <StepRows row={row} zone={zone} />
    </Screen>
  );
}

function Opened({ scheduleId }: { readonly scheduleId: string }): ReactNode {
  const row = useScheduleRow(scheduleId);
  return row === null ? (
    <NotFound
      title="This scheduled action is gone"
      body="It was cleared, or removed on another device."
      action={<Button label="All scheduled" href={href.scheduled()} />}
    />
  ) : (
    <Detail row={row} />
  );
}

export function ScheduledDetailScreen(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <Opened scheduleId={params.data.scheduleId} />
  ) : (
    <NotFound title="Not found" body="This link doesn’t point to a scheduled action." />
  );
}
