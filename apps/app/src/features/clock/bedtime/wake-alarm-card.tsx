import type { PlannerAlarmRow, PlannerBedtimeNight } from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { notifyFailure } from '../../../components/toast-store';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { nextRingTextOf, usePlannerWrites, useShownAlarm, type AlarmDefaults } from '../../planner';
import { AlarmEditor } from '../alarm/alarm-editor';
import { useClockLabel } from '../../../store/clock-format';
import { daysTextOf, wakeAlarmBodyOf, wakeAlarmOf, wakeDaysOf } from './schedule-model';

export interface WakeAlarmProps {
  readonly schedule: readonly PlannerBedtimeNight[];
  readonly alarms: readonly PlannerAlarmRow[];
  readonly weekStart: number;
  readonly now: number;
  readonly zone: string;
  readonly offline: boolean;
  readonly defaults: AlarmDefaults;
}

function LinkedAlarm({
  alarm: row,
  night,
  card,
  onOpen,
}: {
  readonly alarm: PlannerAlarmRow;
  readonly night: PlannerBedtimeNight;
  readonly card: WakeAlarmProps;
  readonly onOpen: (alarmId: string) => void;
}): ReactNode {
  const { alarm, save } = useShownAlarm(null, row);
  const clockLabel = useClockLabel();
  return (
    <View className="flex-row items-center gap-3 rounded-md bg-surface-2 pr-3">
      <Interactive
        label={`Wake alarm ${clockLabel(alarm.time)}, ${daysTextOf(wakeDaysOf(night), card.weekStart)}. Open`}
        onPress={() => {
          onOpen(alarm.id);
        }}
        className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-3 px-3 py-2"
        layerClassName="rounded-md"
      >
        <Icon name="alarmClock" size={20} tone={alarm.enabled ? 'primary' : 'variant'} />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" className="tabular">
            {`${clockLabel(alarm.time)} · ${daysTextOf(wakeDaysOf(night), card.weekStart)}`}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {nextRingTextOf(alarm, card.now, card.zone)}
          </Text>
        </View>
      </Interactive>
      <Switch
        label={`Wake alarm ${clockLabel(alarm.time)}`}
        value={alarm.enabled}
        disabled={card.offline}
        onChange={(enabled) => {
          save({ enabled });
        }}
      />
    </View>
  );
}

function MissingAlarm({
  night,
  card,
}: {
  readonly night: PlannerBedtimeNight;
  readonly card: WakeAlarmProps;
}): ReactNode {
  const writes = usePlannerWrites(null);
  const [busy, setBusy] = useState(false);
  const clockLabel = useClockLabel();
  const body = wakeAlarmBodyOf(night);
  return (
    <View className="flex-row flex-wrap items-center gap-3 rounded-md border-hairline border-outline-variant px-3 py-2">
      <View className="min-w-0 grow basis-48 flex-row items-center gap-3">
        <Icon name="alarmClock" size={20} />
        <Text variant="callout" tone="variant" className="min-w-0 flex-1">
          {`No alarm at ${clockLabel(night.wake)} on ${daysTextOf(body.days, card.weekStart)}`}
        </Text>
      </View>
      <Button
        label="Create alarm"
        icon="plus"
        variant="tonal"
        loading={busy}
        disabled={card.offline}
        onPress={() => {
          setBusy(true);
          writes
            .createAlarm({
              ...card.defaults,
              ...body,
              id: randomUUID(),
              days: [...body.days],
              targets: [...card.defaults.targets],
            })
            .catch(notifyFailure('The wake alarm was not created'))
            .finally(() => {
              setBusy(false);
            });
        }}
      />
    </View>
  );
}

export function WakeAlarmCard(card: WakeAlarmProps): ReactNode {
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  return (
    <Card title="Wake alarm" icon="sunrise">
      <Text variant="footnote" tone="variant">
        Your bedtime ends with an alarm. Each night links to the alarm at its wake time.
      </Text>
      <View className="gap-2">
        {card.schedule.map((night) => {
          const alarm = wakeAlarmOf(card.alarms, night);
          return alarm === null ? (
            <MissingAlarm key={night.days.join()} night={night} card={card} />
          ) : (
            <LinkedAlarm
              key={night.days.join()}
              alarm={alarm}
              night={night}
              card={card}
              onOpen={(alarmId) => {
                setShown(alarmId);
                setOpen(alarmId);
              }}
            />
          );
        })}
      </View>
      <AlarmEditor
        person={null}
        alarmId={shown}
        open={open !== null}
        onClose={() => {
          setOpen(null);
        }}
        onCreated={() => undefined}
      />
    </Card>
  );
}
