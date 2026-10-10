import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EVENT_KINDS, EVENT_KIND_LABELS } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { stateTrigger } from '../model/blanks';
import {
  readableCapabilities,
  triggerOperators,
  type DeviceLike,
} from '../model/capability-choices';
import type { TimedBase } from '../model/signal-triggers';
import { ComparisonField } from './comparison-field';
import { MissingTarget, TargetFields, deviceOptions, targetOf } from './target-fields';

const ANY_DEVICE = 'any';

const EVENT_OPTIONS = EVENT_KINDS.map((kind) => ({ value: kind, label: EVENT_KIND_LABELS[kind] }));

export interface BaseFieldsProps<T extends TimedBase['type']> {
  readonly trigger: Extract<TimedBase, { type: T }>;
  readonly devices: readonly DeviceLike[];
  readonly onChange: (trigger: TimedBase) => void;
}

export function StateFields({ trigger, devices, onChange }: BaseFieldsProps<'state'>): ReactNode {
  const target = targetOf(devices, trigger.deviceId, trigger.capability);
  return (
    <View className="gap-3">
      <TargetFields
        devices={devices}
        usable={readableCapabilities}
        deviceId={trigger.deviceId}
        capability={trigger.capability}
        onTarget={(device, capability) => {
          onChange(stateTrigger(device, capability));
        }}
      />
      {target === null ? (
        <MissingTarget />
      ) : (
        <ComparisonField
          target={target}
          comparison={trigger.comparison}
          operators={triggerOperators(target.capability.value)}
          onChange={(comparison) => {
            onChange({ ...trigger, comparison });
          }}
        />
      )}
    </View>
  );
}

export function EventFields({ trigger, devices, onChange }: BaseFieldsProps<'event'>): ReactNode {
  return (
    <View className="gap-3">
      <Select
        label="Event"
        value={trigger.kind}
        options={EVENT_OPTIONS}
        searchable
        onChange={(kind) => {
          onChange({ ...trigger, kind });
        }}
      />
      <Select
        label="From"
        value={trigger.deviceId ?? ANY_DEVICE}
        options={[{ value: ANY_DEVICE, label: 'Any device' }, ...deviceOptions(devices)]}
        onChange={(id) => {
          onChange({ ...trigger, deviceId: id === ANY_DEVICE ? null : id });
        }}
      />
    </View>
  );
}
