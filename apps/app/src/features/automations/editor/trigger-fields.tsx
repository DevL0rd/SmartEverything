import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TriggerV2 } from '@smarteverything/domain';
import type { Catalog } from '../data/use-automations';
import { formOf, timingOf, windowModesFor, withTiming } from '../model/signal-triggers';
import { StateFields, EventFields } from './device-trigger-fields';
import { MINUTE_UNITS } from './duration-units';
import { GenericSignalFields } from './generic-signal-fields';
import { SpeechFields } from './speech-trigger-fields';
import { TimingSection } from './timing-section';
import { targetOf } from './target-fields';
import { WeatherTriggerFields } from './weather-fields';
import { ClockField, DurationField, SunField, WeekdayToggles } from './time-fields';

type Signal = Extract<TriggerV2, { on: 'signal' }>;

interface FieldsProps {
  readonly catalog: Catalog;
  readonly trigger: TriggerV2;
  readonly onChange: (trigger: TriggerV2) => void;
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function DaysField({
  trigger,
  onChange,
}: {
  readonly trigger: Extract<TriggerV2, { on: 'time' }>;
  readonly onChange: (trigger: TriggerV2) => void;
}): ReactNode {
  return (
    <WeekdayToggles
      value={trigger.days ?? EVERY_DAY}
      onChange={(days) => {
        const { days: _old, ...rest } = trigger;
        onChange(days.length === EVERY_DAY.length ? rest : { ...rest, days });
      }}
    />
  );
}

function SignalFields({
  catalog,
  trigger,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly trigger: Signal;
  readonly onChange: (trigger: TriggerV2) => void;
}): ReactNode {
  const form = formOf(trigger);
  const state = targetOf(catalog.devices, trigger.subject ?? '', trigger.field ?? '');
  const modes = windowModesFor(form, state?.capability.value ?? null);
  const timing = (
    <TimingSection
      timing={timingOf(trigger)}
      modes={modes}
      pulse={form === 'event'}
      onChange={(next) => {
        onChange(withTiming(trigger, next));
      }}
    />
  );
  switch (form) {
    case 'device':
      return (
        <View className="gap-3">
          <StateFields catalog={catalog} trigger={trigger} onChange={onChange} />
          {timing}
        </View>
      );
    case 'event':
      return (
        <View className="gap-3">
          <EventFields catalog={catalog} trigger={trigger} onChange={onChange} />
          {timing}
        </View>
      );
    case 'weather':
      return <WeatherTriggerFields catalog={catalog} trigger={trigger} onChange={onChange} />;
    case 'generic':
      return <GenericSignalFields catalog={catalog} trigger={trigger} onChange={onChange} />;
  }
}

export function TriggerFields({ catalog, trigger, onChange }: FieldsProps): ReactNode {
  switch (trigger.on) {
    case 'speech':
      return <SpeechFields trigger={trigger} onChange={onChange} />;
    case 'signal':
      return <SignalFields catalog={catalog} trigger={trigger} onChange={onChange} />;
    case 'time':
      return (
        <View className="gap-4">
          <ClockField
            label="At"
            value={trigger.at}
            onChange={(at) => {
              onChange({ ...trigger, at });
            }}
          />
          <DaysField trigger={trigger} onChange={onChange} />
        </View>
      );
    case 'sun':
      return (
        <SunField
          event={trigger.event}
          offsetMinutes={trigger.offsetMinutes ?? 0}
          onChange={(event, offsetMinutes) => {
            onChange({ ...trigger, event, offsetMinutes });
          }}
        />
      );
    case 'every':
      return (
        <DurationField
          label="Every"
          value={trigger.minutes}
          units={MINUTE_UNITS}
          max={10_080}
          onChange={(minutes) => {
            onChange({ ...trigger, minutes });
          }}
        />
      );
  }
}
