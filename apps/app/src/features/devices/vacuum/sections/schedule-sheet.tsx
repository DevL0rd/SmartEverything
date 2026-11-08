import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { VACUUM_MODES, type VacuumMode } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Interactive } from '../../../../components/interactive';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { TimeField, localeUsesHour12, type TimeOfDay } from '../../../../components/time-field';
import { cn } from '../../../../design/cn';
import { clockText } from './dnd-model';
import { toggleRoom, type RoomSelection } from '../model/room-selection';
import { CLEAN_MODE_LABELS, EVERY_DAY, WEEK } from '../model/schedule-text';

export interface ScheduleRoom {
  readonly id: number;
  readonly name: string;
}

export interface ScheduleChoice {
  readonly at: string;
  readonly days: readonly number[];
  readonly rooms: RoomSelection;
  readonly mode: VacuumMode | null;
}

type ModeChoice = VacuumMode | 'robot';

const START: TimeOfDay = { hour: 9, minute: 0 };

const MODE_OPTIONS: readonly { readonly value: ModeChoice; readonly label: string }[] = [
  { value: 'robot', label: 'Robot’s setting' },
  ...VACUUM_MODES.map((entry) => ({ value: entry.mode, label: CLEAN_MODE_LABELS[entry.mode] })),
];

function toggled(days: readonly number[], day: number): readonly number[] {
  return days.includes(day) ? days.filter((chosen) => chosen !== day) : [...days, day];
}

function Toggle({
  label,
  spoken,
  on,
  grow,
  radio = false,
  onPress,
}: {
  readonly label: string;
  readonly spoken: string;
  readonly on: boolean;
  readonly grow: boolean;
  readonly radio?: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={spoken}
      role={radio ? 'radio' : 'checkbox'}
      checked={on}
      onPress={onPress}
      className={cn(
        'min-h-touch-min items-center justify-center rounded-full border-hairline',
        grow ? 'flex-1' : 'px-4',
        on ? 'border-primary bg-primary' : 'border-outline-variant bg-surface-1',
      )}
      layerClassName="rounded-full"
    >
      <Text variant="label" tone={on ? 'onPrimary' : 'default'} numberOfLines={1}>
        {label}
      </Text>
    </Interactive>
  );
}

function Field({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="body-strong" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function DaysField({
  days,
  onChange,
}: {
  readonly days: readonly number[];
  readonly onChange: (days: readonly number[]) => void;
}): ReactNode {
  return (
    <Field title="Days">
      <View className="flex-row gap-1">
        {WEEK.map((entry) => (
          <Toggle
            key={entry.day}
            label={entry.letter}
            spoken={entry.name}
            on={days.includes(entry.day)}
            grow
            onPress={() => {
              onChange(toggled(days, entry.day));
            }}
          />
        ))}
      </View>
      {days.length === 0 ? (
        <Text variant="footnote" tone="warning" accessibilityLiveRegion="polite">
          Choose at least one day.
        </Text>
      ) : null}
    </Field>
  );
}

function RoomsField({
  rooms,
  chosen,
  onChange,
}: {
  readonly rooms: readonly ScheduleRoom[];
  readonly chosen: RoomSelection;
  readonly onChange: (chosen: RoomSelection) => void;
}): ReactNode {
  return (
    <Field title="Rooms">
      <View className="flex-row flex-wrap gap-2">
        <Toggle
          label="Whole home"
          spoken="Whole home"
          on={chosen.length === 0}
          grow={false}
          onPress={() => {
            onChange([]);
          }}
        />
        {rooms.map((room) => (
          <Toggle
            key={room.id}
            label={room.name}
            spoken={room.name}
            on={chosen.includes(room.id)}
            grow={false}
            onPress={() => {
              onChange(toggleRoom(chosen, room.id));
            }}
          />
        ))}
      </View>
    </Field>
  );
}

function ModeField({
  mode,
  onChange,
}: {
  readonly mode: ModeChoice;
  readonly onChange: (mode: ModeChoice) => void;
}): ReactNode {
  return (
    <Field title="Mode">
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
        {MODE_OPTIONS.map((option) => (
          <Toggle
            key={option.value}
            label={option.label}
            spoken={option.label}
            on={mode === option.value}
            grow={false}
            radio
            onPress={() => {
              onChange(option.value);
            }}
          />
        ))}
      </View>
    </Field>
  );
}

function Footer({
  saving,
  valid,
  onSave,
  onClose,
}: {
  readonly saving: boolean;
  readonly valid: boolean;
  readonly onSave: () => void;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <>
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button label="Add schedule" loading={saving} disabled={!valid} onPress={onSave} />
    </>
  );
}

export function ScheduleSheet({
  rooms,
  saving,
  onSave,
  onClose,
}: {
  readonly rooms: readonly ScheduleRoom[];
  readonly saving: boolean;
  readonly onSave: (choice: ScheduleChoice) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [time, setTime] = useState(START);
  const [days, setDays] = useState(EVERY_DAY);
  const [chosen, setChosen] = useState<RoomSelection>([]);
  const [mode, setMode] = useState<ModeChoice>('robot');
  const save = (): void => {
    onSave({
      at: clockText(time.hour, time.minute),
      days: EVERY_DAY.filter((day) => days.includes(day)),
      rooms: chosen,
      mode: chosen.length === 0 || mode === 'robot' ? null : mode,
    });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="New schedule"
      detents={['fit']}
      scroll
      footer={<Footer saving={saving} valid={days.length > 0} onSave={save} onClose={onClose} />}
    >
      <View className="gap-5 px-4 pb-4">
        <TimeField label="Time" value={time} onChange={setTime} hour12={localeUsesHour12()} />
        <DaysField days={days} onChange={setDays} />
        <RoomsField rooms={rooms} chosen={chosen} onChange={setChosen} />
        {chosen.length === 0 ? (
          <Text variant="footnote" tone="variant">
            A whole-home clean uses the robot’s own mode and power.
          </Text>
        ) : (
          <ModeField mode={mode} onChange={setMode} />
        )}
      </View>
    </Sheet>
  );
}
