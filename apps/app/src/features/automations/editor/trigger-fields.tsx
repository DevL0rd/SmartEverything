import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { View } from 'react-native';
import type { Trigger } from '@smarteverything/domain';
import type { DeviceLike } from '../model/capability-choices';
import { baseOf } from '../model/signal-triggers';
import { GenericSignalFields } from './generic-signal-fields';
import { TimedFields } from './timed-trigger-fields';
import { WeatherTriggerFields } from './weather-fields';
import {
  ClockField,
  DurationField,
  SunField,
  WeekdayToggles,
  type DurationUnits,
} from './time-fields';

const MINUTE_UNITS: DurationUnits = [
  { value: 'minutes', label: 'min', size: 1 },
  { value: 'hours', label: 'h', size: 60 },
  { value: 'days', label: 'd', size: 1440 },
];

interface FieldsProps<T extends Trigger['type']> {
  readonly trigger: Extract<Trigger, { type: T }>;
  readonly devices: readonly DeviceLike[];
  readonly onChange: (trigger: Trigger) => void;
}

function TimeFields({ trigger, onChange }: FieldsProps<'time'>): ReactNode {
  return (
    <View className="gap-4">
      <ClockField
        label="At"
        value={trigger.at}
        onChange={(at) => {
          onChange({ ...trigger, at });
        }}
      />
      <WeekdayToggles
        value={trigger.weekdays}
        onChange={(weekdays) => {
          onChange({ ...trigger, weekdays });
        }}
      />
    </View>
  );
}

function SignalCapableFields({
  trigger,
  devices,
  onChange,
}: FieldsProps<'state' | 'event' | 'signal'>): ReactNode {
  const base = baseOf(trigger);
  if (base === null) {
    return trigger.type === 'signal' ? (
      <GenericSignalFields trigger={trigger} devices={devices} onChange={onChange} />
    ) : null;
  }
  return <TimedFields trigger={trigger} base={base} devices={devices} onChange={onChange} />;
}

export function TriggerFields({
  trigger,
  devices,
  onChange,
}: {
  readonly trigger: Trigger;
  readonly devices: readonly DeviceLike[];
  readonly onChange: (trigger: Trigger) => void;
}): ReactNode {
  switch (trigger.type) {
    case 'speech':
      return (
        <Text variant="callout" tone="variant">
          This saved speech trigger is preserved. Editing becomes available when the connected hub
          provides its authorized speech sources.
        </Text>
      );
    case 'state':
    case 'event':
    case 'signal':
      return <SignalCapableFields trigger={trigger} devices={devices} onChange={onChange} />;
    case 'time':
      return <TimeFields trigger={trigger} devices={devices} onChange={onChange} />;
    case 'sun':
      return (
        <SunField
          event={trigger.event}
          offsetMinutes={trigger.offsetMinutes}
          onChange={(event, offsetMinutes) => {
            onChange({ ...trigger, event, offsetMinutes });
          }}
        />
      );
    case 'interval':
      return (
        <DurationField
          label="Every"
          value={trigger.everyMinutes}
          units={MINUTE_UNITS}
          max={10_080}
          onChange={(everyMinutes) => {
            onChange({ ...trigger, everyMinutes });
          }}
        />
      );
    case 'weather':
    case 'weather_kind':
      return <WeatherTriggerFields trigger={trigger} onChange={onChange} />;
  }
}
