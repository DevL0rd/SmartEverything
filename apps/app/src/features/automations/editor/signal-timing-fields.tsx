import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SIGNAL_LIMITS, type SignalWindowMode } from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { SwitchRow } from '../../../components/rows';
import { Segmented } from '../../../components/segmented';
import type { SignalTiming } from '../model/signal-triggers';
import { SECOND_UNITS } from './duration-units';
import { Labelled } from './labelled';
import { DurationField } from './time-fields';

const MODE_LABELS: Readonly<Record<SignalWindowMode, string>> = {
  avg: 'Average',
  min: 'Lowest',
  max: 'Highest',
  rate: 'Change per min',
  count: 'Times',
};

const DEFAULT_SECONDS = 60;

interface TimedRowProps {
  readonly title: string;
  readonly subtitle: string;
  readonly seconds: number;
  readonly max: number;
  readonly onChange: (seconds: number) => void;
}

function TimedRow({ title, subtitle, seconds, max, onChange }: TimedRowProps): ReactNode {
  return (
    <View className="gap-3">
      <SwitchRow
        title={title}
        subtitle={subtitle}
        value={seconds > 0}
        onChange={(on) => {
          onChange(on ? DEFAULT_SECONDS : 0);
        }}
      />
      {seconds > 0 ? (
        <DurationField
          label={title}
          hideLabel
          value={seconds}
          units={SECOND_UNITS}
          max={max}
          onChange={onChange}
        />
      ) : null}
    </View>
  );
}

interface WindowProps {
  readonly timing: SignalTiming;
  readonly window: NonNullable<SignalTiming['window']>;
  readonly modes: readonly SignalWindowMode[];
  readonly onChange: (timing: SignalTiming) => void;
}

function WindowKind({ timing, window, modes, onChange }: WindowProps): ReactNode {
  if (modes.length === 1 && modes[0] === 'count')
    return (
      <Labelled label="At least">
        <NumberStepper
          label="At least"
          value={timing.atLeast}
          min={2}
          max={SIGNAL_LIMITS.windowSamples}
          step={1}
          unit="times"
          onChange={(atLeast) => {
            onChange({ ...timing, atLeast });
          }}
        />
      </Labelled>
    );
  return (
    <Segmented
      label="Use"
      value={window.of}
      options={modes.map((mode) => ({ value: mode, label: MODE_LABELS[mode] }))}
      onChange={(mode) => {
        onChange({ ...timing, window: { ...window, of: mode } });
      }}
    />
  );
}

function WindowDetail(props: WindowProps): ReactNode {
  const { timing, window, onChange } = props;
  return (
    <View className="gap-3">
      <WindowKind {...props} />
      <DurationField
        label="Within"
        value={window.seconds}
        units={SECOND_UNITS}
        max={SIGNAL_LIMITS.windowSeconds}
        onChange={(seconds) => {
          onChange({ ...timing, window: { ...window, seconds } });
        }}
      />
    </View>
  );
}

function WindowFields({
  timing,
  modes,
  onChange,
}: {
  readonly timing: SignalTiming;
  readonly modes: readonly SignalWindowMode[];
  readonly onChange: (timing: SignalTiming) => void;
}): ReactNode {
  const counting = modes.length === 1 && modes[0] === 'count';
  const window = timing.window;
  return (
    <View className="gap-3">
      <SwitchRow
        title={counting ? 'Count how often' : 'Smooth over time'}
        subtitle={
          counting ? 'Only when it happens several times' : 'Use the average, lowest or highest'
        }
        value={window !== null}
        onChange={(on) => {
          const mode = modes[0];
          onChange({
            ...timing,
            window: on && mode !== undefined ? { of: mode, seconds: DEFAULT_SECONDS } : null,
          });
        }}
      />
      {window === null ? null : (
        <WindowDetail timing={timing} window={window} modes={modes} onChange={onChange} />
      )}
    </View>
  );
}

export function SignalTimingFields({
  timing,
  modes,
  pulse,
  onChange,
}: {
  readonly timing: SignalTiming;
  readonly modes: readonly SignalWindowMode[];
  readonly pulse: boolean;
  readonly onChange: (timing: SignalTiming) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      {modes.length > 0 ? <WindowFields timing={timing} modes={modes} onChange={onChange} /> : null}
      {pulse && timing.window === null ? null : (
        <TimedRow
          title="Must stay true for"
          subtitle="Ignore short spikes"
          seconds={timing.holdSeconds}
          max={SIGNAL_LIMITS.holdSeconds}
          onChange={(holdSeconds) => {
            onChange({ ...timing, holdSeconds });
          }}
        />
      )}
      <TimedRow
        title="Wait for it to settle"
        subtitle="Decide after quick bursts calm down"
        seconds={timing.debounceSeconds}
        max={SIGNAL_LIMITS.debounceSeconds}
        onChange={(debounceSeconds) => {
          onChange({ ...timing, debounceSeconds });
        }}
      />
      <TimedRow
        title="Don’t repeat for"
        subtitle="Run at most once in this time"
        seconds={timing.cooldownSeconds}
        max={SIGNAL_LIMITS.cooldownSeconds}
        onChange={(cooldownSeconds) => {
          onChange({ ...timing, cooldownSeconds });
        }}
      />
    </View>
  );
}
