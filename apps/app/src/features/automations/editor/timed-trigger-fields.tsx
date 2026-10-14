import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Trigger, ValueDescriptor } from '@smarteverything/domain';
import type { DeviceLike } from '../model/capability-choices';
import {
  NO_TIMING,
  timingOf,
  windowModesFor,
  withTiming,
  type SignalTiming,
  type TimedBase,
} from '../model/signal-triggers';
import { EventFields, StateFields } from './device-trigger-fields';
import { targetOf } from './target-fields';
import { TimingSection } from './timing-section';

function valueOf(base: TimedBase, devices: readonly DeviceLike[]): ValueDescriptor | null {
  return base.type === 'state'
    ? (targetOf(devices, base.deviceId, base.capability)?.capability.value ?? null)
    : null;
}

function fittedTiming(
  base: TimedBase,
  timing: SignalTiming,
  devices: readonly DeviceLike[],
): SignalTiming {
  const window = timing.window;
  return window === null || windowModesFor(base, valueOf(base, devices)).includes(window.mode)
    ? timing
    : { ...timing, window: null };
}

export function TimedFields({
  trigger,
  base,
  devices,
  onChange,
}: {
  readonly trigger: Trigger;
  readonly base: TimedBase;
  readonly devices: readonly DeviceLike[];
  readonly onChange: (trigger: Trigger) => void;
}): ReactNode {
  const timing = timingOf(trigger);
  const changeBase = (next: TimedBase): void => {
    const kept = next.type === base.type ? timing : NO_TIMING;
    onChange(withTiming(next, fittedTiming(next, kept, devices), trigger));
  };
  return (
    <View className="gap-3">
      {base.type === 'state' ? (
        <StateFields trigger={base} devices={devices} onChange={changeBase} />
      ) : (
        <EventFields trigger={base} devices={devices} onChange={changeBase} />
      )}
      <TimingSection
        timing={timing}
        modes={windowModesFor(base, valueOf(base, devices))}
        pulse={base.type === 'event'}
        onChange={(next) => {
          onChange(withTiming(base, next, trigger));
        }}
      />
    </View>
  );
}
