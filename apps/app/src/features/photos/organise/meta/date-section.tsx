import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DateNav } from '../../../../components/date-nav';
import { NumberStepper } from '../../../../components/number-stepper';
import { Segmented, type SegmentedOption } from '../../../../components/segmented';
import { Select, type SelectOption } from '../../../../components/select';
import { Text } from '../../../../components/text';
import { TimeField } from '../../../../components/time-field';
import { localDayKey } from '../../../../format/time';
import {
  NO_SHIFT,
  shiftText,
  ZONE_OFFSETS,
  zoneText,
  type DateDraft,
  type ShiftDraft,
  type WallDraft,
} from './meta-model';
import { useHour24 } from '../../../../store/clock-format';

type DateMode = DateDraft['kind'];

export interface DateSectionProps {
  readonly draft: DateDraft;
  readonly onDraft: (draft: DateDraft) => void;
  readonly start: WallDraft;
  readonly shiftable: boolean;
}

const KEEP: SegmentedOption<DateMode> = { value: 'keep', label: 'Keep', icon: 'history' };
const SET: SegmentedOption<DateMode> = { value: 'set', label: 'Set a date', icon: 'calendar' };
const SHIFT: SegmentedOption<DateMode> = { value: 'shift', label: 'Shift by', icon: 'clock' };

const DIRECTIONS: readonly SegmentedOption<'earlier' | 'later'>[] = [
  { value: 'earlier', label: 'Earlier' },
  { value: 'later', label: 'Later' },
];

const ZONES: readonly SelectOption<string>[] = ZONE_OFFSETS.map((offset) => ({
  value: String(offset),
  label: zoneText(offset),
}));

function dayDate(day: string): Date {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

function SetControls({
  wall,
  onWall,
}: {
  readonly wall: WallDraft;
  readonly onWall: (wall: WallDraft) => void;
}): ReactNode {
  const hour24 = useHour24();
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-3">
        <DateNav
          value={dayDate(wall.day)}
          range="day"
          withYear
          onChange={(date) => {
            onWall({ ...wall, day: localDayKey(date) });
          }}
        />
        <TimeField
          hour24={hour24}
          label="Time taken"
          value={{ hour: Math.floor(wall.minute / 60), minute: wall.minute % 60 }}
          onChange={(time) => {
            onWall({ ...wall, minute: time.hour * 60 + time.minute });
          }}
        />
      </View>
      <Select
        label="Time zone"
        options={ZONES}
        value={String(wall.offsetMin)}
        searchable
        onChange={(value) => {
          onWall({ ...wall, offsetMin: Number(value) });
        }}
      />
    </View>
  );
}

interface ShiftPart {
  readonly key: 'days' | 'hours' | 'minutes';
  readonly label: string;
  readonly max: number;
}

const SHIFT_PARTS: readonly ShiftPart[] = [
  { key: 'days', label: 'Days', max: Number.MAX_SAFE_INTEGER },
  { key: 'hours', label: 'Hours', max: 23 },
  { key: 'minutes', label: 'Minutes', max: 59 },
];

function ShiftSteppers({
  shift,
  onShift,
}: {
  readonly shift: ShiftDraft;
  readonly onShift: (shift: ShiftDraft) => void;
}): ReactNode {
  return (
    <View className="gap-1">
      {SHIFT_PARTS.map((part) => (
        <View key={part.key} className="flex-row items-center justify-between gap-3">
          <Text variant="callout" className="min-w-0 flex-1">
            {part.label}
          </Text>
          <NumberStepper
            label={part.label}
            value={shift[part.key]}
            min={0}
            max={part.max}
            step={1}
            onChange={(value) => {
              onShift({ ...shift, [part.key]: value });
            }}
          />
        </View>
      ))}
    </View>
  );
}

function ShiftControls({
  shift,
  onShift,
}: {
  readonly shift: ShiftDraft;
  readonly onShift: (shift: ShiftDraft) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Segmented
        options={DIRECTIONS}
        value={shift.later ? 'later' : 'earlier'}
        label="Shift direction"
        onChange={(value) => {
          onShift({ ...shift, later: value === 'later' });
        }}
      />
      <ShiftSteppers shift={shift} onShift={onShift} />
      <Text variant="footnote" tone="variant" className="tabular-nums">
        {shiftText(shift)}
      </Text>
    </View>
  );
}

function draftFor(mode: DateMode, props: DateSectionProps): DateDraft {
  if (mode === 'set') return { kind: 'set', wall: props.start };
  if (mode === 'shift') return { kind: 'shift', shift: NO_SHIFT };
  return { kind: 'keep' };
}

export function DateSection(props: DateSectionProps): ReactNode {
  const { draft, onDraft } = props;
  return (
    <View className="gap-3">
      <Segmented
        options={props.shiftable ? [KEEP, SET, SHIFT] : [KEEP, SET]}
        value={draft.kind}
        label="Change the date"
        fill
        onChange={(mode) => {
          onDraft(draftFor(mode, props));
        }}
      />
      {draft.kind === 'set' ? (
        <SetControls
          wall={draft.wall}
          onWall={(wall) => {
            onDraft({ kind: 'set', wall });
          }}
        />
      ) : null}
      {draft.kind === 'shift' ? (
        <ShiftControls
          shift={draft.shift}
          onShift={(shift) => {
            onDraft({ kind: 'shift', shift });
          }}
        />
      ) : null}
    </View>
  );
}
