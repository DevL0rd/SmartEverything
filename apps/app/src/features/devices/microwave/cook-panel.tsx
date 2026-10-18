import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import {
  MICROWAVE_KEYS,
  type MicrowaveMode,
  type MicrowaveProgram,
  type MicrowaveTemperatureRange,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { NumberStepper } from '../../../components/number-stepper';
import { ReasonLine } from '../../../components/reason-line';
import { Text } from '../../../components/text';
import { programPowerOptions, type MicrowaveConfiguration } from './model';
import { ModeChips } from './mode-chips';
import { PowerArc } from './power-arc';
import { TimeControl } from './time-control';
import { choiceLabel } from './quick-model';
import { useCookingDraft, type CookingDraft } from './use-cooking-draft';
import type { Device } from '../../../store/state';

function Notice({
  message,
  critical = false,
}: {
  readonly message: string | null;
  readonly critical?: boolean;
}): ReactNode {
  return message === null ? null : (
    <Text
      variant="footnote"
      tone={critical ? 'critical' : 'variant'}
      accessibilityLiveRegion="polite"
    >
      {message}
    </Text>
  );
}

function TemperatureField({
  program,
  range,
  unit,
  disabled,
  onChange,
}: {
  readonly program: MicrowaveProgram;
  readonly range: MicrowaveTemperatureRange;
  readonly unit: string;
  readonly disabled: boolean;
  readonly onChange: (program: MicrowaveProgram) => void;
}): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="callout">Temperature</Text>
      <NumberStepper
        label="Cooking temperature"
        value={program.temperature}
        min={range.min}
        max={range.max}
        step={range.resolution}
        unit={`°${unit}`}
        disabled={disabled}
        onChange={(next) => {
          onChange({ ...program, temperature: next });
        }}
      />
    </View>
  );
}

function Fields({
  program,
  mode,
  config,
  disabled,
  onChange,
}: {
  readonly program: MicrowaveProgram;
  readonly mode: MicrowaveMode;
  readonly config: MicrowaveConfiguration;
  readonly disabled: boolean;
  readonly onChange: (program: MicrowaveProgram) => void;
}): ReactNode {
  const time = mode.supportedOptions.operationTime;
  const temperature = mode.supportedOptions.temperature?.[config.unit];
  const power = programPowerOptions(mode, config);
  return (
    <View className="gap-4">
      {power.length === 0 ? null : (
        <PowerArc
          levels={power}
          value={program.power}
          disabled={disabled}
          onChange={(next) => {
            onChange({ ...program, power: next });
          }}
        />
      )}
      {temperature === undefined ? null : (
        <TemperatureField
          program={program}
          range={temperature}
          unit={config.unit}
          disabled={disabled}
          onChange={onChange}
        />
      )}
      {time === undefined ? null : (
        <TimeControl
          range={time}
          value={program.duration}
          disabled={disabled}
          onChange={(next) => {
            onChange({ ...program, duration: next });
          }}
        />
      )}
    </View>
  );
}

function Go({
  draft,
  mode,
  program,
}: {
  readonly draft: CookingDraft;
  readonly mode: MicrowaveMode;
  readonly program: MicrowaveProgram;
}): ReactNode {
  const starts = draft.startsRemotely && draft.values[MICROWAVE_KEYS.state]?.value === 'ready';
  return (
    <View className="gap-2">
      {starts ? (
        <Button
          label="Start"
          icon="play"
          size="lg"
          disabled={!draft.runnable}
          loading={draft.busy}
          onPress={() => {
            background(draft.run(true), 'draft.run_failed');
          }}
        />
      ) : null}
      <Button
        label={
          starts
            ? 'Save without starting'
            : mode.supportedOperations.includes('set')
              ? choiceLabel(mode, program, false)
              : 'Save'
        }
        icon="timer"
        variant={starts ? 'text' : 'tonal'}
        disabled={!draft.savable}
        loading={starts ? false : draft.busy}
        onPress={() => {
          background(draft.run(false), 'draft.run_failed');
        }}
      />
    </View>
  );
}

function Footer({
  draft,
  mode,
  program,
  active,
}: {
  readonly draft: CookingDraft;
  readonly mode: MicrowaveMode;
  readonly program: MicrowaveProgram;
  readonly active: boolean;
}): ReactNode {
  return (
    <>
      {active || draft.readiness !== null ? null : (
        <Go draft={draft} mode={mode} program={program} />
      )}
      {mode.supportedOperations.includes('start') ? null : (
        <ReasonLine text="This mode starts on the microwave." />
      )}
    </>
  );
}

export function CookPanel({ device }: { readonly device: Device }): ReactNode {
  const draft = useCookingDraft(device);
  const state = draft.values[MICROWAVE_KEYS.state]?.value;
  const { mode, program } = draft;
  const picked = mode === undefined || program === null ? null : { mode, program };
  return (
    <View className="gap-4">
      <ModeChips
        modes={draft.config.modes}
        value={mode?.mode ?? ''}
        disabled={!draft.selectable}
        onChange={draft.select}
      />
      {picked === null ? null : (
        <Fields
          program={picked.program}
          mode={picked.mode}
          config={draft.config}
          disabled={!draft.editable}
          onChange={draft.change}
        />
      )}
      {draft.readiness === null ? null : <ReasonLine text={draft.readiness} />}
      {picked === null ? null : (
        <Footer
          draft={draft}
          mode={picked.mode}
          program={picked.program}
          active={state === 'running' || state === 'paused'}
        />
      )}
      <Notice message={draft.error} critical />
      <Notice message={draft.result} />
      <Notice message={draft.config.problem} />
    </View>
  );
}
