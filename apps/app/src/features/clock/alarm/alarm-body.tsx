import type { PlannerAlarmRow, PlannerPreferences } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { profileIn } from '../../planner/data/person';
import { useStoreSelector } from '../../../store/store-context';
import {
  alarmLabelOf,
  skipDayOf,
  weekdayNameOf,
  weekdayOfKey,
} from '../../planner/clock/alarm-text';
import type { PlannerPerson } from '../../planner/data';
import { useHubOffline } from '../frame/hub-status';
import { draftOf, newAlarmTimeOf, newDraftOf, toggledTargetsEdit } from './alarm-draft';
import { AlarmFields, AlarmTime, type AlarmFieldProps } from './alarm-fields';
import { SmartWakeRow, WakeRoutine } from './alarm-wake';
import { RingTargets, hasPersonWatch, ringPlacesOf, useRingSources } from './ring-targets';
import { useAlarmEdit, type AlarmEditing } from './use-alarm-edit';

export interface AlarmBodyTarget {
  readonly person: PlannerPerson;
  readonly alarm: PlannerAlarmRow | null;
  readonly onCreated: (alarm: PlannerAlarmRow) => void;
  readonly onClose: () => void;
}

export interface AlarmScreen {
  readonly editing: AlarmEditing;
  readonly fields: AlarmFieldProps;
  readonly title: string;
}

export function useAlarmScreen(
  target: AlarmBodyTarget,
  prefs: PlannerPreferences,
  compact: boolean,
): AlarmScreen {
  const now = useMinute();
  const timeZone = useSettings().time_zone;
  const offline = useHubOffline();
  const editing = useAlarmEdit({
    person: target.person,
    alarm: target.alarm,
    fresh:
      target.alarm === null
        ? newDraftOf(prefs.clock, newAlarmTimeOf(now, timeZone))
        : draftOf(target.alarm),
    onCreated: target.onCreated,
    onDeleted: target.onClose,
  });
  return {
    editing,
    title: target.alarm === null ? 'New alarm' : alarmLabelOf(editing.draft),
    fields: {
      draft: editing.draft,
      compact,
      now,
      timeZone,
      weekStart: prefs.general.week_start,
      disabled: offline || editing.busy,
      onChange: editing.change,
    },
  };
}

function skipLabelOf(alarm: PlannerAlarmRow, now: number, timeZone: string): string | null {
  if (alarm.skip_on !== null) return `Ring ${weekdayNameOf(weekdayOfKey(alarm.skip_on))} again`;
  const day = skipDayOf(alarm, now, timeZone);
  return day === null || !alarm.enabled ? null : `Skip ${day}`;
}

export function AlarmSkip({ screen }: { readonly screen: AlarmScreen }): ReactNode {
  const { editing, fields } = screen;
  const alarm = editing.alarm;
  if (alarm === null) return null;
  const label = skipLabelOf(alarm, fields.now, fields.timeZone);
  if (label === null) return null;
  return (
    <Button
      label={label}
      icon={alarm.skip_on === null ? 'skipForward' : 'undo'}
      variant="outlined"
      disabled={fields.disabled}
      onPress={alarm.skip_on === null ? editing.skipNext : editing.ringNextAgain}
    />
  );
}

function useProfileOf(target: AlarmBodyTarget): string | null {
  const person = target.person;
  const shown = useStoreSelector((state) => profileIn(state, person), Object.is, [person]);
  return target.alarm?.profile_id ?? shown;
}

export function AlarmBody({
  target,
  screen,
  defaultSceneId,
}: {
  readonly target: AlarmBodyTarget;
  readonly screen: AlarmScreen;
  readonly defaultSceneId: string | null;
}): ReactNode {
  const { editing, fields } = screen;
  const sources = useRingSources(useProfileOf(target));
  const watch = target.alarm?.watch ?? [];
  const places = ringPlacesOf(sources, { targets: fields.draft.targets, watch });
  const wake = {
    draft: fields.draft,
    compact: fields.compact,
    disabled: fields.disabled,
    onChange: fields.onChange,
  };
  return (
    <View className="gap-4">
      <AlarmTime {...fields} />
      <AlarmFields {...fields} />
      {hasPersonWatch(sources) || watch.length > 0 ? <SmartWakeRow {...wake} /> : null}
      <WakeRoutine {...wake} defaultSceneId={defaultSceneId} />
      <RingTargets
        places={places}
        targets={fields.draft.targets}
        watch={watch}
        disabled={fields.disabled}
        onToggle={(ring) => {
          fields.onChange(toggledTargetsEdit(fields.draft.targets, ring));
        }}
      />
      {editing.alarm === null ? null : (
        <View className="items-start border-t-hairline border-outline-variant pt-3">
          <Button
            label="Delete alarm"
            icon="trash"
            variant="destructive"
            disabled={fields.disabled}
            onPress={editing.remove}
          />
        </View>
      )}
    </View>
  );
}

export function AlarmCreateBar({
  screen,
  onCancel,
}: {
  readonly screen: AlarmScreen;
  readonly onCancel: () => void;
}): ReactNode {
  const { editing, fields } = screen;
  if (editing.alarm !== null) return null;
  return (
    <View className="flex-row gap-2">
      <Button label="Cancel" variant="outlined" grow onPress={onCancel} />
      <Button
        label="Add alarm"
        icon="plus"
        grow
        loading={editing.busy}
        disabled={fields.disabled}
        onPress={editing.create}
      />
    </View>
  );
}

export function AlarmTitle({ screen }: { readonly screen: AlarmScreen }): ReactNode {
  return (
    <Text variant="title-3" numberOfLines={1} className="min-w-0 flex-1">
      {screen.title}
    </Text>
  );
}
