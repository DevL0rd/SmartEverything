import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  EVENT_KINDS,
  EVENT_KIND_LABELS,
  SIGNAL_SOURCES,
  kindSpecOf,
  type DeviceCapability,
  type SignalTriggerV2,
  type TriggerTestV2,
} from '@smarteverything/domain';
import { Select } from '../../../components/select';
import type { Catalog } from '../data/use-automations';
import {
  readableCapabilities,
  seedOf,
  testFor,
  triggerOperators,
  type TestOperator,
} from '../model/capability-choices';
import { signalOf } from '../model/signal-triggers';
import { SignalMatchFields } from './signal-match-fields';
import { MissingTarget, TargetFields, deviceOptions, targetOf } from './target-fields';
import { TestFields } from './test-fields';

const ANY_DEVICE = 'any';

const EVENT_OPTIONS = EVENT_KINDS.map((kind) => ({ value: kind, label: EVENT_KIND_LABELS[kind] }));

interface TriggerFieldsProps {
  readonly catalog: Catalog;
  readonly trigger: SignalTriggerV2;
  readonly onChange: (trigger: SignalTriggerV2) => void;
}

function stateTest(capability: DeviceCapability): TriggerTestV2 {
  const descriptor = capability.value;
  const operator: TestOperator =
    descriptor.kind === 'number' ? 'gt' : descriptor.kind === 'boolean' ? 'eq' : 'changed';
  return testFor(operator, seedOf(descriptor));
}

export function StateFields({ catalog, trigger, onChange }: TriggerFieldsProps): ReactNode {
  const target = targetOf(catalog.devices, trigger.subject ?? '', trigger.field ?? '');
  return (
    <View className="gap-3">
      <TargetFields
        devices={catalog.devices}
        usable={readableCapabilities}
        deviceId={trigger.subject ?? ''}
        capability={trigger.field ?? ''}
        onTarget={(device, capability) => {
          onChange({
            ...trigger,
            subject: device.id,
            field: capability.key,
            test: stateTest(capability),
          });
        }}
      />
      {target === null ? (
        <MissingTarget />
      ) : (
        <TestFields
          catalog={catalog}
          shape={{ type: 'reading', device: target.device, capability: target.capability }}
          test={trigger.test ?? { is: 'changed' }}
          operators={triggerOperators(target.capability.value)}
          onChange={(test) => {
            onChange({ ...trigger, test });
          }}
        />
      )}
    </View>
  );
}

export function EventFields({ catalog, trigger, onChange }: TriggerFieldsProps): ReactNode {
  const { subject: _subject, ...anyDevice } = trigger;
  return (
    <View className="gap-3">
      <Select
        label="Event"
        value={trigger.kind}
        options={EVENT_OPTIONS}
        searchable
        onChange={(kind) => {
          const spec = kindSpecOf(SIGNAL_SOURCES, { source: 'event', kind });
          const next = spec === undefined ? { ...trigger, kind } : signalOf('event', spec, trigger);
          onChange(trigger.subject === undefined ? next : { ...next, subject: trigger.subject });
        }}
      />
      <Select
        label="From"
        value={trigger.subject ?? ANY_DEVICE}
        options={[{ value: ANY_DEVICE, label: 'Any device' }, ...deviceOptions(catalog.devices)]}
        onChange={(id) => {
          onChange(id === ANY_DEVICE ? anyDevice : { ...trigger, subject: id });
        }}
      />
      <SignalMatchFields
        source="event"
        kind={trigger.kind}
        match={trigger.match}
        onChange={(match) => {
          const { match: _old, ...rest } = trigger;
          onChange(match === undefined ? rest : { ...rest, match });
        }}
      />
    </View>
  );
}
