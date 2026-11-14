import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { DateNav } from '../../../components/date-nav';
import { Figure } from '../../../components/figure';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { TextField } from '../../../components/text-field';
import { TimeField } from '../../../components/time-field';
import { dayKeyOf, startOfDayKey } from '../../../format/time';
import { alarmLabelOf, dateTextOf } from '../../planner/clock/alarm-text';
import { DayDots } from '../../planner/clock/day-dots';
import {
  MINUTES_IN_HOUR,
  clockTextOf,
  rampOptions,
  timeOfClockText,
} from '../../planner/settings/options';
import {
  firstOnceDateOf,
  labelEdit,
  onceOnEdit,
  repeatEdit,
  repeatModeOf,
  toggledDayEdit,
  type AlarmDraft,
  type AlarmEdit,
} from './alarm-draft';
import { REPEAT_OPTIONS } from './alarm-options';
import { SoundPicker } from './sound-picker';

export interface AlarmFieldProps {
  readonly draft: AlarmDraft;
  readonly compact: boolean;
  readonly now: number;
  readonly timeZone: string;
  readonly weekStart: number;
  readonly disabled: boolean;
  readonly onChange: (edit: AlarmEdit) => void;
}

export function AlarmTime({ draft, weekStart, disabled, onChange }: AlarmFieldProps): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View className="items-center gap-3">
      <Interactive
        label={`Change the time, ${draft.time}`}
        expanded={open}
        disabled={disabled}
        onPress={() => {
          setOpen(!open);
        }}
        className="min-h-touch-min items-center justify-center px-4"
        layerClassName="rounded-md"
      >
        <Figure value={draft.time} size="xl" tone={draft.enabled ? 'default' : 'variant'} />
      </Interactive>
      {open ? (
        <TimeField
          label="Alarm time"
          value={timeOfClockText(draft.time)}
          onChange={(time) => {
            onChange({ time: clockTextOf(time) });
          }}
        />
      ) : null}
      <DayDots
        days={draft.days}
        weekStart={weekStart}
        disabled={disabled}
        onToggle={(day) => {
          onChange(toggledDayEdit(draft.days, day));
        }}
      />
    </View>
  );
}

export function FieldRows({
  compact,
  children,
}: {
  readonly compact: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return compact ? <View>{children}</View> : <List>{children}</List>;
}

function LabelRow({ draft, compact, disabled, onChange }: AlarmFieldProps): ReactNode {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const commit = (): void => {
    onChange(labelEdit(text));
    setEditing(false);
  };
  return (
    <View>
      <ListRow
        title="Label"
        icon="pencil"
        compact={compact}
        value={alarmLabelOf(draft)}
        chevron
        expanded={editing}
        disabled={disabled}
        onPress={() => {
          setText(draft.label ?? '');
          setEditing(!editing);
        }}
      />
      {editing ? (
        <View className={compact ? 'pb-3' : 'px-4 pb-3'}>
          <TextField
            label="Alarm label"
            value={text}
            onChange={setText}
            onSubmit={commit}
            onBlur={commit}
            placeholder="Wake up"
            focusOnMount
            showLabel={false}
          />
        </View>
      ) : null}
    </View>
  );
}

function RepeatRow({ draft, compact, disabled, onChange }: AlarmFieldProps): ReactNode {
  return (
    <SelectRow
      title="Repeat"
      icon="repeat"
      compact={compact}
      options={REPEAT_OPTIONS}
      value={repeatModeOf(draft)}
      disabled={disabled}
      onChange={(mode) => {
        onChange(repeatEdit(mode, draft.days));
      }}
    />
  );
}

function OnceOnRow({
  draft,
  now,
  timeZone,
  compact,
  disabled,
  onChange,
}: AlarmFieldProps): ReactNode {
  if (draft.once_on === null) {
    return (
      <ListRow
        title="Ring once on"
        subtitle="A date replaces the repeat days"
        icon="calendar"
        compact={compact}
        value="Pick a date"
        chevron
        disabled={disabled}
        onPress={() => {
          onChange(onceOnEdit(firstOnceDateOf(draft.time, now, timeZone)));
        }}
      />
    );
  }
  if (disabled) {
    return (
      <ListRow
        title="Ring once on"
        subtitle={dateTextOf(draft.once_on)}
        icon="calendar"
        compact={compact}
      />
    );
  }
  return <OnceOnDate day={draft.once_on} compact={compact} onChange={onChange} />;
}

function OnceOnDate({
  day,
  compact,
  onChange,
}: {
  readonly day: string;
  readonly compact: boolean;
  readonly onChange: (edit: AlarmEdit) => void;
}): ReactNode {
  const nav = (
    <DateNav
      value={new Date(startOfDayKey(day))}
      range="day"
      onChange={(date) => {
        onChange(onceOnEdit(dayKeyOf(date.getTime())));
      }}
    />
  );
  const remove = (
    <IconButton
      icon="close"
      label="Remove the date"
      onPress={() => {
        onChange(onceOnEdit(null));
      }}
    />
  );
  const row = { title: 'Ring once on', subtitle: dateTextOf(day), icon: 'calendar' } as const;
  if (compact) {
    return (
      <View>
        <ListRow {...row} compact trailing={remove} />
        <View className="items-start pb-2 pl-8">{nav}</View>
      </View>
    );
  }
  return (
    <ListRow
      {...row}
      trailing={
        <View className="flex-row items-center gap-1">
          {nav}
          {remove}
        </View>
      }
    />
  );
}

function SnoozeRow({ draft, compact, disabled, onChange }: AlarmFieldProps): ReactNode {
  return (
    <ListRow
      title="Snooze"
      icon="timer"
      compact={compact}
      trailing={
        <NumberStepper
          label="Snooze"
          value={draft.snooze_minutes}
          min={1}
          max={MINUTES_IN_HOUR}
          step={1}
          unit="min"
          disabled={disabled}
          onChange={(minutes) => {
            onChange({ snooze_minutes: minutes });
          }}
        />
      }
    />
  );
}

export function AlarmFields(props: AlarmFieldProps): ReactNode {
  const { draft, compact, disabled, onChange } = props;
  return (
    <FieldRows compact={compact}>
      <LabelRow {...props} />
      <RepeatRow {...props} />
      <OnceOnRow {...props} />
      <SoundPicker
        sound={draft.sound}
        compact={compact}
        disabled={disabled}
        onChange={(sound) => {
          onChange({ sound });
        }}
      />
      <SelectRow
        title="Gentle volume"
        icon="sunrise"
        compact={compact}
        options={rampOptions(String(draft.ramp_seconds))}
        value={String(draft.ramp_seconds)}
        disabled={disabled}
        onChange={(seconds) => {
          onChange({ ramp_seconds: Number(seconds) });
        }}
      />
      <SwitchRow
        title="Vibrate"
        icon="smartphone"
        compact={compact}
        value={draft.vibrate}
        disabled={disabled}
        onChange={(vibrate) => {
          onChange({ vibrate });
        }}
      />
      <SnoozeRow {...props} />
    </FieldRows>
  );
}
