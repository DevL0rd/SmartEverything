import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { TimeField } from '../../../components/time-field';
import { useMinute } from '../../../store/clock';
import {
  DEFAULT_WHEN,
  MOST_MINUTES,
  PRESET_MINUTES,
  clampMinutes,
  minutesLabel,
  type When,
} from './when';

type Mode = When['kind'];
type Preset = string;

const MODES: readonly { readonly value: Mode; readonly label: string }[] = [
  { value: 'in', label: 'In a while' },
  { value: 'at', label: 'At a time' },
];

const PRESETS: readonly { readonly value: Preset; readonly label: string }[] = [
  ...PRESET_MINUTES.map((minutes) => ({
    value: String(minutes),
    label: minutesLabel(minutes),
  })),
  { value: 'custom', label: 'Custom' },
];

function soonTime(now: number): When {
  const soon = new Date(now + 60 * 60_000);
  return { kind: 'at', time: { hour: soon.getHours(), minute: 0 } };
}

function InPicker({
  minutes,
  onChange,
}: {
  readonly minutes: number;
  readonly onChange: (when: When) => void;
}): ReactNode {
  const [custom, setCustom] = useState(!PRESET_MINUTES.includes(minutes));
  const preset: Preset = custom ? 'custom' : String(minutes);
  return (
    <View className="gap-3">
      <Segmented
        label="How long from now"
        options={PRESETS}
        value={preset}
        onChange={(value) => {
          setCustom(value === 'custom');
          if (value !== 'custom') {
            onChange({ kind: 'in', minutes: Number(value) });
          }
        }}
      />
      {custom ? (
        <NumberStepper
          label="Minutes from now"
          value={minutes}
          min={1}
          max={MOST_MINUTES}
          step={5}
          formatValue={minutesLabel}
          onChange={(value) => {
            onChange({ kind: 'in', minutes: clampMinutes(value) });
          }}
        />
      ) : null}
    </View>
  );
}

export function WhenPicker({
  value,
  onChange,
}: {
  readonly value: When;
  readonly onChange: (when: When) => void;
}): ReactNode {
  const now = useMinute();
  return (
    <View className="gap-4">
      <Segmented
        label="When"
        options={MODES}
        value={value.kind}
        onChange={(mode) => {
          onChange(mode === 'in' ? DEFAULT_WHEN : soonTime(now));
        }}
      />
      {value.kind === 'in' ? (
        <InPicker minutes={value.minutes} onChange={onChange} />
      ) : (
        <TimeField
          label="Time"
          value={value.time}
          onChange={(time) => {
            onChange({ kind: 'at', time });
          }}
        />
      )}
    </View>
  );
}
