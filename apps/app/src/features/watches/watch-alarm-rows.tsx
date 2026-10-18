import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { WatchAlarm } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { Figure } from '../../components/figure';
import { ListRow } from '../../components/list-row';
import { SwitchRow } from '../../components/rows';
import { List } from '../../components/section';
import { Segmented } from '../../components/segmented';
import { Sheet } from '../../components/sheet';
import { Switch } from '../../components/switch';
import { TimeField, localeUsesHour12 } from '../../components/time-field';
import type { WatchCommand } from './watch-config';
import { clockText, timeLabel, timeOf } from './watch-time';

type Day = WatchAlarm['days'][number];

const EVERY_DAY: readonly Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const REPEATS: Readonly<
  Record<
    'once' | 'daily' | 'weekdays' | 'weekends',
    { readonly label: string; readonly days: readonly Day[] }
  >
> = {
  once: { label: 'Once', days: [] },
  daily: { label: 'Every day', days: EVERY_DAY },
  weekdays: { label: 'Weekdays', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  weekends: { label: 'Weekends', days: ['sat', 'sun'] },
};

type Repeat = keyof typeof REPEATS;

const REPEAT_KEYS: readonly Repeat[] = ['once', 'daily', 'weekdays', 'weekends'];

function repeatOf(days: readonly Day[]): Repeat | null {
  return REPEAT_KEYS.find((key) => REPEATS[key].days.join() === days.join()) ?? null;
}

function daysText(days: readonly Day[]): string {
  const repeat = repeatOf(days);
  return repeat === null
    ? days.map((day) => day.charAt(0).toUpperCase() + day.slice(1)).join(', ')
    : REPEATS[repeat].label;
}

interface Draft {
  readonly time: string;
  readonly days: readonly Day[];
  readonly smart: boolean;
}

function AlarmFields({
  draft,
  onChange,
}: {
  readonly draft: Draft;
  readonly onChange: (draft: Draft) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <TimeField
        label="Time"
        value={timeOf(draft.time)}
        hour12={localeUsesHour12()}
        onChange={(time) => {
          onChange({ ...draft, time: clockText(time) });
        }}
      />
      <Segmented
        label="Repeat"
        value={repeatOf(draft.days) ?? 'once'}
        options={REPEAT_KEYS.map((key) => ({ value: key, label: REPEATS[key].label }))}
        onChange={(next) => {
          onChange({ ...draft, days: REPEATS[next].days });
        }}
      />
      <SwitchRow
        title="Smart wake"
        subtitle="Wakes you in a light sleep phase shortly before"
        value={draft.smart}
        onChange={(smart) => {
          onChange({ ...draft, smart });
        }}
      />
    </View>
  );
}

function AlarmSheet({
  alarm,
  command,
  onClose,
}: {
  readonly alarm: WatchAlarm | null;
  readonly command: WatchCommand;
  readonly onClose: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<Draft>(
    alarm ?? { time: '07:00', days: REPEATS.weekdays.days, smart: false },
  );
  const id = alarm?.id ?? null;
  const remove = (): void => {
    onClose();
    if (id !== null) command.run({ type: 'delete_alarm', id });
  };
  const footer = (
    <>
      {id === null ? null : <Button label="Delete" variant="text" onPress={remove} />}
      <Button
        label="Save"
        onPress={() => {
          onClose();
          command.run({
            type: 'save_alarm',
            alarm: {
              id,
              enabled: alarm?.enabled ?? true,
              time: draft.time,
              days: [...draft.days],
              smart: draft.smart,
            },
          });
        }}
      />
    </>
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title={alarm === null ? 'New alarm' : 'Edit alarm'}
      detents={['fit']}
      footer={footer}
    >
      <AlarmFields draft={draft} onChange={setDraft} />
    </Sheet>
  );
}

export function alarmKey(alarm: WatchAlarm, index: number): string {
  return alarm.id === null ? `${alarm.time}-${String(index)}` : String(alarm.id);
}

function AlarmRow({
  alarm,
  command,
  onEdit,
}: {
  readonly alarm: WatchAlarm;
  readonly command: WatchCommand;
  readonly onEdit: () => void;
}): ReactNode {
  const id = alarm.id;
  return (
    <ListRow
      leading={
        <Figure value={timeLabel(alarm.time)} size="l" tone={alarm.enabled ? 'default' : 'faint'} />
      }
      title={daysText(alarm.days)}
      {...(alarm.smart ? { subtitle: 'Smart wake' } : {})}
      disabled={command.busy}
      onPress={onEdit}
      trailing={
        <Switch
          label={`Alarm at ${timeLabel(alarm.time)}`}
          value={alarm.enabled}
          disabled={command.busy}
          onChange={(enabled) => {
            command.run({ type: 'save_alarm', alarm: { ...alarm, enabled } });
          }}
        />
      }
      contextMenu={
        id === null
          ? []
          : [
              {
                label: 'Delete alarm',
                icon: 'trash',
                destructive: true,
                onPress: (): void => {
                  command.run({ type: 'delete_alarm', id });
                },
              },
            ]
      }
    />
  );
}

export function WatchAlarms({
  alarms,
  command,
}: {
  readonly alarms: readonly WatchAlarm[];
  readonly command: WatchCommand;
}): ReactNode {
  const [editing, setEditing] = useState<WatchAlarm | 'new' | null>(null);
  return (
    <List inset title="Alarms">
      {alarms.map((alarm, index) => (
        <AlarmRow
          key={alarmKey(alarm, index)}
          alarm={alarm}
          command={command}
          onEdit={() => {
            setEditing(alarm);
          }}
        />
      ))}
      <ListRow
        title="Add alarm"
        icon="alarmClock"
        chevron
        disabled={command.busy}
        onPress={() => {
          setEditing('new');
        }}
      />
      {editing === null ? null : (
        <AlarmSheet
          alarm={editing === 'new' ? null : editing}
          command={command}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </List>
  );
}
