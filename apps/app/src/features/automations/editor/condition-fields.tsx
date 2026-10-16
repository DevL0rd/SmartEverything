import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { LegacyCondition as Condition } from '@smarteverything/domain';
import { stateCondition } from '../model/blanks';
import { readableCapabilities, valueOperators, type DeviceLike } from '../model/capability-choices';
import { ComparisonField } from './comparison-field';
import { MissingTarget, TargetFields, targetOf } from './target-fields';
import { ClockField, WeekdayToggles } from './time-fields';
import { WeatherConditionFields } from './weather-fields';

type StateCondition = Extract<Condition, { type: 'state' }>;

function StateConditionFields({
  condition,
  devices,
  onChange,
}: {
  readonly condition: StateCondition;
  readonly devices: readonly DeviceLike[];
  readonly onChange: (condition: Condition) => void;
}): ReactNode {
  const target = targetOf(devices, condition.deviceId, condition.capability);
  return (
    <View className="gap-3">
      <TargetFields
        devices={devices}
        usable={readableCapabilities}
        deviceId={condition.deviceId}
        capability={condition.capability}
        onTarget={(device, capability) => {
          onChange(stateCondition(device, capability));
        }}
      />
      {target === null ? (
        <MissingTarget />
      ) : (
        <ComparisonField
          target={target}
          comparison={condition.comparison}
          operators={valueOperators(target.capability.value)}
          onChange={(comparison) => {
            if (comparison.operator !== 'changed') {
              onChange({ ...condition, comparison });
            }
          }}
        />
      )}
    </View>
  );
}

export function ConditionFields({
  condition,
  devices,
  onChange,
}: {
  readonly condition: Condition;
  readonly devices: readonly DeviceLike[];
  readonly onChange: (condition: Condition) => void;
}): ReactNode {
  switch (condition.type) {
    case 'state':
      return <StateConditionFields condition={condition} devices={devices} onChange={onChange} />;
    case 'time_window':
      return (
        <View className="flex-row flex-wrap gap-6">
          <ClockField
            label="After"
            value={condition.after}
            onChange={(after) => {
              onChange({ ...condition, after });
            }}
          />
          <ClockField
            label="Before"
            value={condition.before}
            onChange={(before) => {
              onChange({ ...condition, before });
            }}
          />
        </View>
      );
    case 'weekday':
      return (
        <WeekdayToggles
          value={condition.weekdays}
          onChange={(weekdays) => {
            onChange({ ...condition, weekdays });
          }}
        />
      );
    case 'weather':
    case 'weather_kind':
    case 'daylight':
      return <WeatherConditionFields condition={condition} onChange={onChange} />;
  }
}
