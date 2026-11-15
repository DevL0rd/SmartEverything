import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TimeField } from '../../../components/time-field';
import { clockOfMinutes } from '../../../format/time';
import { DayDots, timeOfClockText } from '../../planner';
import { sleepLengthText, sleepMinutesOf, wrapMinute, type DialTimes } from './dial-model';
import { daysTextOf } from './schedule-model';

export interface NightDraft {
  readonly index: number | null;
  readonly days: readonly number[];
  readonly times: DialTimes;
}

export interface NightSheetProps {
  readonly draft: NightDraft | null;
  readonly weekStart: number;
  readonly onChange: (draft: NightDraft) => void;
  readonly onSave: (draft: NightDraft) => void;
  readonly onRemove: (index: number) => void;
  readonly onClose: () => void;
}

function minuteOfTime(time: { readonly hour: number; readonly minute: number }): number {
  return wrapMinute(time.hour * 60 + time.minute);
}

function toggled(days: readonly number[], day: number): readonly number[] {
  return days.includes(day) ? days.filter((one) => one !== day) : [...days, day];
}

function TimeRow({
  label,
  minute,
  onChange,
}: {
  readonly label: string;
  readonly minute: number;
  readonly onChange: (minute: number) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3">
      <Text variant="body-strong">{label}</Text>
      <TimeField
        label={label}
        value={timeOfClockText(clockOfMinutes(minute))}
        onChange={(time) => {
          onChange(minuteOfTime(time));
        }}
      />
    </View>
  );
}

function NightFooter({
  draft,
  onSave,
  onRemove,
}: {
  readonly draft: NightDraft;
  readonly onSave: () => void;
  readonly onRemove: (index: number) => void;
}): ReactNode {
  const { index } = draft;
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      {index === null ? null : (
        <Button
          label="Remove nights"
          icon="trash"
          variant="text"
          onPress={() => {
            onRemove(index);
          }}
        />
      )}
      <View className="flex-1" />
      <Button
        label={index === null ? 'Add nights' : 'Save'}
        icon="check"
        disabled={draft.days.length === 0 || draft.times.bed === draft.times.wake}
        onPress={onSave}
      />
    </View>
  );
}

function NightBody({
  draft,
  weekStart,
  onChange,
}: {
  readonly draft: NightDraft;
  readonly weekStart: number;
  readonly onChange: (draft: NightDraft) => void;
}): ReactNode {
  const same = draft.times.bed === draft.times.wake;
  return (
    <View className="gap-5 pb-4 pt-2">
      <View className="gap-2">
        <Text variant="caption" tone="variant">
          Nights
        </Text>
        <DayDots
          days={draft.days}
          weekStart={weekStart}
          onToggle={(day) => {
            onChange({ ...draft, days: toggled(draft.days, day) });
          }}
        />
        <Text variant="footnote" tone="variant">
          {`${daysTextOf(draft.days, weekStart)}. A night belongs to the day you go to bed.`}
        </Text>
      </View>
      <TimeRow
        label="Go to bed"
        minute={draft.times.bed}
        onChange={(bed) => {
          onChange({ ...draft, times: { ...draft.times, bed } });
        }}
      />
      <TimeRow
        label="Wake up"
        minute={draft.times.wake}
        onChange={(wake) => {
          onChange({ ...draft, times: { ...draft.times, wake } });
        }}
      />
      <Text variant="callout" tone={same ? 'critical' : 'variant'}>
        {same
          ? 'Bed and wake times need to differ.'
          : `${sleepLengthText(sleepMinutesOf(draft.times))} in bed`}
      </Text>
    </View>
  );
}

export function NightSheet({
  draft,
  weekStart,
  onChange,
  onSave,
  onRemove,
  onClose,
}: NightSheetProps): ReactNode {
  return (
    <Sheet
      open={draft !== null}
      onClose={onClose}
      title={draft?.index === null ? 'Add nights' : 'Change bedtime'}
      detents={['fit']}
      footer={
        draft === null ? null : (
          <NightFooter
            draft={draft}
            onRemove={onRemove}
            onSave={() => {
              onSave(draft);
            }}
          />
        )
      }
    >
      {draft === null ? null : (
        <NightBody draft={draft} weekStart={weekStart} onChange={onChange} />
      )}
    </Sheet>
  );
}
