import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';

const DAYS = [
  { value: '0,1,2,3,4,5,6', label: 'Every day' },
  { value: '1,2,3,4,5', label: 'Weekdays' },
  { value: '0,6', label: 'Weekends' },
  ...['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
    (day, index) => ({ value: String(index), label: day }),
  ),
];
const TIMES = [
  { value: 'clock', label: 'At a clock time' },
  { value: '@sunrise', label: 'At sunrise' },
  { value: '@sunrise-', label: 'Before sunrise' },
  { value: '@sunrise+', label: 'After sunrise' },
  { value: '@sunset', label: 'At sunset' },
  { value: '@sunset-', label: 'Before sunset' },
  { value: '@sunset+', label: 'After sunset' },
];

function timeExpression(mode: string, hour: string, minute: string, day: string): string {
  if (mode === 'clock') return `0 ${minute} ${hour} * * ${day}`;
  const offset =
    Number(hour) === 0 && Number(minute) === 0
      ? ''
      : `${Number(hour) === 0 ? '' : `${hour}h`}${Number(minute) === 0 ? '' : `${minute}m`}`;
  return `${offset === '' ? mode.replace(/[+-]$/, '') : mode}${offset} * * ${day}`;
}

export function ScheduleTimeBuilder({
  change,
}: {
  readonly change: (value: string) => void;
}): ReactNode {
  const [mode, setMode] = useState('clock');
  const [day, setDay] = useState('0,1,2,3,4,5,6');
  const [hour, setHour] = useState('0');
  const [minute, setMinute] = useState('0');
  const sunAt = mode === '@sunrise' || mode === '@sunset';
  const valid = validTime(hour, mode === 'clock' ? 23 : Infinity) && validTime(minute, 59);
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong">Build a schedule</Text>
      <Select label="Time basis" value={mode} options={TIMES} onChange={setMode} />
      <Select label="Days" value={day} options={DAYS} onChange={setDay} />
      {sunAt ? null : (
        <TimeFields
          mode={mode}
          hour={hour}
          minute={minute}
          setHour={setHour}
          setMinute={setMinute}
        />
      )}
      <Button
        label="Use this schedule"
        variant="tonal"
        disabled={!valid}
        onPress={() => {
          change(timeExpression(mode, sunAt ? '0' : hour, sunAt ? '0' : minute, day));
        }}
      />
    </View>
  );
}

function validTime(value: string, maximum: number): boolean {
  return (
    value.trim() !== '' &&
    Number.isInteger(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= maximum
  );
}
function TimeFields({
  mode,
  hour,
  minute,
  setHour,
  setMinute,
}: {
  readonly mode: string;
  readonly hour: string;
  readonly minute: string;
  readonly setHour: (value: string) => void;
  readonly setMinute: (value: string) => void;
}): ReactNode {
  return (
    <View className="flex-row gap-3">
      <View className="flex-1">
        <TextField
          label={mode === 'clock' ? 'Hour (0–23)' : 'Offset hours'}
          kind="number"
          value={hour}
          onChange={setHour}
        />
      </View>
      <View className="flex-1">
        <TextField
          label={mode === 'clock' ? 'Minute (0–59)' : 'Offset minutes'}
          kind="number"
          value={minute}
          onChange={setMinute}
        />
      </View>
    </View>
  );
}
