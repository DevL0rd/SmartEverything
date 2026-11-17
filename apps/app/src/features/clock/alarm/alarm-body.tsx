import type { PlannerAlarmRow, PlannerPreferences } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import {
  profileIn,
  alarmLabelOf,
  skipDayOf,
  weekdayNameOf,
  weekdayOfKey,
  type PlannerPerson,
} from '../../planner';
import { useStoreSelector } from '../../../store/store-context';
import { useHubOffline } from '../frame/hub-status';
import { draftOf, newAlarmTimeOf, newDraftOf, toggledTargetsEdit } from './alarm-draft';
import { AlarmFields, AlarmTime, FieldSection, type AlarmFieldProps } from './alarm-fields';
import { AlarmChallenge } from './alarm-challenge';
import { AlarmSunrise } from './alarm-sunrise';
import { SmartWakeRow, WakeRoutine } from './alarm-wake';
import {
  RingTargets,
  hasPersonWatch,
  reachesPhone,
  ringPlacesOf,
  useRingSources,
} from './ring-targets';
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
      skipOn: editing.alarm === null ? null : editing.alarm.skip_on,
      disabled: offline || (editing.alarm === null && editing.busy),
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
      disabled={fields.disabled || editing.busy}
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
  defaultAutomationId,
}: {
  readonly target: AlarmBodyTarget;
  readonly screen: AlarmScreen;
  readonly defaultAutomationId: string | null;
}): ReactNode {
  const { fields } = screen;
  const sources = useRingSources(useProfileOf(target));
  const watch = target.alarm?.watch ?? [];
  const rings = ringPlacesOf(sources, { targets: fields.draft.targets, watch });
  const wake = {
    draft: fields.draft,
    compact: fields.compact,
    disabled: fields.disabled,
    onChange: fields.onChange,
  };
  const watched = hasPersonWatch(sources) || watch.length > 0;
  const places = { phone: reachesPhone(sources, fields.draft.targets), watch: watched };
  return (
    <View className="gap-section-gap">
      <AlarmTime {...fields} />
      <AlarmFields {...fields} />
      <FieldSection title="Wake" compact={fields.compact}>
        {watched ? <SmartWakeRow {...wake} /> : null}
        <AlarmSunrise {...wake} />
        <WakeRoutine {...wake} defaultAutomationId={defaultAutomationId} />
      </FieldSection>
      <FieldSection title="Dismiss challenge" compact={fields.compact}>
        <AlarmChallenge {...wake} places={places} />
      </FieldSection>
      <RingTargets
        places={rings}
        targets={fields.draft.targets}
        watch={watch}
        compact={fields.compact}
        disabled={fields.disabled}
        onToggle={(ring) => {
          fields.onChange(toggledTargetsEdit(fields.draft.targets, ring));
        }}
      />
      <AlarmDelete screen={screen} />
    </View>
  );
}

function AlarmDelete({ screen }: { readonly screen: AlarmScreen }): ReactNode {
  if (screen.editing.alarm === null) return null;
  return (
    <View className="items-start">
      <Button
        label="Delete alarm"
        icon="trash"
        variant="destructive"
        disabled={screen.fields.disabled || screen.editing.busy}
        onPress={screen.editing.remove}
      />
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
    <View className="w-full flex-row gap-2">
      <Button label="Cancel" variant="outlined" grow onPress={onCancel} />
      <Button
        label="Add alarm"
        icon="plus"
        grow
        loading={editing.busy}
        disabled={fields.disabled || editing.busy}
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
