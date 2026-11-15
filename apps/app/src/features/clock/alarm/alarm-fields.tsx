import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { DateNav } from '../../../components/date-nav';
import { Figure } from '../../../components/figure';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List, Section } from '../../../components/section';
import { TextField } from '../../../components/text-field';
import { TimeField } from '../../../components/time-field';
import { dayKeyOf, startOfDayKey } from '../../../format/time';
import {
  alarmLabelOf,
  dateTextOf,
  DayDots,
  MINUTES_IN_HOUR,
  clockTextOf,
  rampOptions,
  timeOfClockText,
} from '../../planner';
import {
  firstOnceDateOf,
  labelEdit,
  onceOnEdit,
  repeatEdit,
  repeatModeOf,
  snoozeLimitEdit,
  toggledDayEdit,
  type AlarmDraft,
  type AlarmEdit,
} from './alarm-draft';
import { minutesText, REPEAT_OPTIONS, snoozeLimitText } from './alarm-options';
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
  const picking = open && !disabled;
  return (
    <View className="items-center gap-3">
      {picking ? (
        <View className="min-h-touch-min flex-row items-center gap-2">
          <TimeField
            label="Alarm time"
            value={timeOfClockText(draft.time)}
            onChange={(time) => {
              onChange({ time: clockTextOf(time) });
            }}
          />
          <IconButton
            icon="check"
            label="Done changing the time"
            variant="tonal"
            onPress={() => {
              setOpen(false);
            }}
          />
        </View>
      ) : (
        <Interactive
          label={`Change the time, ${draft.time}`}
          expanded={false}
          disabled={disabled}
          onPress={() => {
            setOpen(true);
          }}
          className="min-h-touch-min items-center justify-center px-4"
          layerClassName="rounded-md"
        >
          <Figure value={draft.time} size="xl" tone={draft.enabled ? 'default' : 'variant'} />
        </Interactive>
      )}
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

export function FieldSection({
  title,
  compact,
  children,
}: {
  readonly title: string;
  readonly compact: boolean;
  readonly children: ReactNode;
}): ReactNode {
  if (!compact) return <List title={title}>{children}</List>;
  return (
    <Section title={title}>
      <View>{children}</View>
    </Section>
  );
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

function RepeatRow({
  draft,
  now,
  timeZone,
  compact,
  disabled,
  onChange,
}: AlarmFieldProps): ReactNode {
  return (
    <SelectRow
      title="Repeat"
      icon="repeat"
      compact={compact}
      options={REPEAT_OPTIONS}
      value={repeatModeOf(draft)}
      disabled={disabled}
      onChange={(mode) => {
        onChange(repeatEdit(mode, draft.days, firstOnceDateOf(draft.time, now, timeZone)));
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
  if (repeatModeOf(draft) !== 'once') return null;
  if (draft.once_on === null) {
    return (
      <ListRow
        title="On"
        icon="calendar"
        compact={compact}
        value="Next time it comes round"
        chevron
        disabled={disabled}
        label="Pick a date for the alarm"
        onPress={() => {
          onChange(onceOnEdit(firstOnceDateOf(draft.time, now, timeZone)));
        }}
      />
    );
  }
  if (disabled) {
    return (
      <ListRow
        title="On"
        icon="calendar"
        compact={compact}
        value={dateTextOf(draft.once_on)}
        disabled
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
  return (
    <ListRow
      title="On"
      icon="calendar"
      compact={compact}
      trailing={
        <DateNav
          value={new Date(startOfDayKey(day))}
          range="day"
          onChange={(date) => {
            onChange(onceOnEdit(dayKeyOf(date.getTime())));
          }}
        />
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
      disabled={disabled}
      trailing={
        <NumberStepper
          label="Snooze"
          value={draft.snooze_minutes}
          min={1}
          max={MINUTES_IN_HOUR}
          step={1}
          formatValue={minutesText}
          disabled={disabled}
          onChange={(minutes) => {
            onChange({ snooze_minutes: minutes });
          }}
        />
      }
    />
  );
}

function SnoozeLimitRow({ draft, compact, disabled, onChange }: AlarmFieldProps): ReactNode {
  return (
    <ListRow
      title="Snooze limit"
      icon="repeat"
      compact={compact}
      disabled={disabled}
      trailing={
        <NumberStepper
          label="Snooze limit"
          value={draft.snooze_limit ?? 0}
          min={0}
          max={Number.MAX_SAFE_INTEGER}
          step={1}
          formatValue={snoozeLimitText}
          disabled={disabled}
          onChange={(limit) => {
            onChange(snoozeLimitEdit(limit));
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
      <SnoozeLimitRow {...props} />
    </FieldRows>
  );
}
