import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DisplayMode } from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { Select } from '../../../components/select';
import { useComputerChoices, type ComputerChoices } from '../data/use-computer-choices';
import type { Catalog } from '../data/use-automations';
import {
  DISPLAY_ACTIONS,
  DISPLAY_SIDES,
  NIGHT_LIGHT_MODES,
  blankDisplayChange,
  displayActionOffered,
  keepable,
  withoutKeep,
  type DisplayChange,
  type DisplayStep,
} from '../model/computer-steps';
import { ComputerSelect, LevelField, NameField } from './computer-fields';
import { NumberInput } from './number-input';

interface DisplayFieldsProps {
  readonly catalog: Catalog;
  readonly step: DisplayStep;
  readonly onChange: (step: DisplayStep) => void;
}

interface DetailProps<C extends DisplayChange> {
  readonly change: C;
  readonly choices: ComputerChoices;
  readonly onChange: (change: DisplayChange) => void;
}

type Of<A extends DisplayChange['action']> = Extract<DisplayChange, { action: A }>;

const SIDE_LABELS = {
  left: 'To the left of',
  right: 'To the right of',
  above: 'Above',
  below: 'Below',
} as const;

const NIGHT_LABELS = { on: 'On', off: 'Off', scheduled: 'On a schedule' } as const;

function ScreenField({
  label,
  value,
  choices,
  anyLabel,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly choices: ComputerChoices;
  readonly anyLabel?: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <NameField
      label={label}
      value={value}
      names={choices.screens.map((screen) => screen.name)}
      helper="The screen’s name on the computer’s Displays page."
      {...(anyLabel === undefined ? {} : { anyLabel })}
      onChange={onChange}
    />
  );
}

function modeKey(mode: Pick<DisplayMode, 'width' | 'height' | 'refreshHz'>): string {
  return `${String(mode.width)}x${String(mode.height)}@${String(Math.round(mode.refreshHz))}`;
}

function ModeFields({ change, choices, onChange }: DetailProps<Of<'mode'>>): ReactNode {
  const target = choices.screens.find(
    (screen) => screen.name === change.output || screen.id === change.output,
  );
  const modes = target?.modes ?? [];
  const current =
    change.refreshHz === undefined ? null : modeKey({ ...change, refreshHz: change.refreshHz });
  return (
    <>
      <ScreenField
        label="Screen"
        value={change.output}
        choices={choices}
        onChange={(output) => {
          onChange({ ...change, output });
        }}
      />
      {modes.length > 0 ? (
        <Select
          label="Resolution and refresh rate"
          placeholder="Pick one"
          searchable
          value={current}
          options={modes.map((mode) => ({
            value: modeKey(mode),
            label: `${String(mode.width)} × ${String(mode.height)} at ${String(Math.round(mode.refreshHz))} Hz`,
          }))}
          onChange={(key) => {
            const mode = modes.find((candidate) => modeKey(candidate) === key);
            if (mode !== undefined)
              onChange({
                ...change,
                width: mode.width,
                height: mode.height,
                refreshHz: Math.round(mode.refreshHz),
              });
          }}
        />
      ) : (
        <TypedMode change={change} onChange={onChange} />
      )}
    </>
  );
}

function TypedMode({
  change,
  onChange,
}: {
  readonly change: Of<'mode'>;
  readonly onChange: (change: DisplayChange) => void;
}): ReactNode {
  return (
    <>
      <LevelField
        label="Width"
        unit="px"
        value={change.width}
        onChange={(width) => {
          onChange({ ...change, width });
        }}
      />
      <LevelField
        label="Height"
        unit="px"
        value={change.height}
        onChange={(height) => {
          onChange({ ...change, height });
        }}
      />
      <NumberInput
        label="Refresh rate"
        unit="Hz"
        optional
        value={change.refreshHz}
        onChange={(refreshHz) => {
          const { refreshHz: _old, ...rest } = change;
          onChange(refreshHz === undefined ? rest : { ...rest, refreshHz });
        }}
      />
    </>
  );
}

function PositionFields({ change, choices, onChange }: DetailProps<Of<'position'>>): ReactNode {
  return (
    <>
      <ScreenField
        label="Move this screen"
        value={change.output}
        choices={choices}
        onChange={(output) => {
          onChange({ ...change, output });
        }}
      />
      <Select
        label="Place it"
        value={change.side}
        options={DISPLAY_SIDES.map((side) => ({ value: side, label: SIDE_LABELS[side] }))}
        onChange={(side) => {
          onChange({ ...change, side });
        }}
      />
      <ScreenField
        label="This screen"
        value={change.relativeTo}
        choices={choices}
        onChange={(relativeTo) => {
          onChange({ ...change, relativeTo });
        }}
      />
    </>
  );
}

function BrightnessFields({ change, choices, onChange }: DetailProps<Of<'brightness'>>): ReactNode {
  return (
    <>
      <ScreenField
        label="Screen"
        value={change.output ?? ''}
        choices={choices}
        anyLabel="Every screen"
        onChange={(output) => {
          const { output: _old, ...rest } = change;
          onChange(output === '' ? rest : { ...rest, output });
        }}
      />
      <LevelField
        label="Brightness"
        unit="%"
        value={change.level}
        onChange={(level) => {
          onChange({ ...change, level });
        }}
      />
    </>
  );
}

function NightLightFields({
  change,
  onChange,
}: Pick<DetailProps<Of<'night_light'>>, 'change' | 'onChange'>): ReactNode {
  return (
    <>
      <Select
        label="Night light"
        value={change.mode}
        options={NIGHT_LIGHT_MODES.map((mode) => ({ value: mode, label: NIGHT_LABELS[mode] }))}
        onChange={(mode) => {
          onChange({ ...change, mode });
        }}
      />
      <NumberInput
        label="Warmth"
        unit="K"
        optional
        value={change.temperatureKelvin}
        onChange={(temperatureKelvin) => {
          const { temperatureKelvin: _old, ...rest } = change;
          onChange(temperatureKelvin === undefined ? rest : { ...rest, temperatureKelvin });
        }}
      />
    </>
  );
}

function ChangeFields({ change, choices, onChange }: DetailProps<DisplayChange>): ReactNode {
  switch (change.action) {
    case 'mode':
      return <ModeFields change={change} choices={choices} onChange={onChange} />;
    case 'scale':
      return (
        <>
          <ScreenField
            label="Screen"
            value={change.output}
            choices={choices}
            onChange={(output) => {
              onChange({ ...change, output });
            }}
          />
          <LevelField
            label="Scale"
            unit="%"
            value={change.percent}
            onChange={(percent) => {
              onChange({ ...change, percent });
            }}
          />
        </>
      );
    case 'position':
      return <PositionFields change={change} choices={choices} onChange={onChange} />;
    case 'brightness':
      return <BrightnessFields change={change} choices={choices} onChange={onChange} />;
    case 'night_light':
      return <NightLightFields change={change} onChange={onChange} />;
  }
}

function KeepRow({ step, onChange }: Pick<DisplayFieldsProps, 'step' | 'onChange'>): ReactNode {
  if (!keepable(step.change)) return null;
  return (
    <SwitchRow
      title="Keep it without asking"
      subtitle={
        step.keep === true
          ? 'Kept once the screen shows the change; if it does not, it goes straight back.'
          : 'Goes back after 15 seconds unless someone keeps it at the computer.'
      }
      value={step.keep === true}
      onChange={(keep) => {
        onChange(keep ? { ...step, keep } : withoutKeep(step));
      }}
    />
  );
}

export function ComputerDisplayFields({ catalog, step, onChange }: DisplayFieldsProps): ReactNode {
  const device = catalog.allDevices.find((candidate) => candidate.id === step.computer);
  const choices = useComputerChoices(step.computer, device?.online === true);
  const change = (next: DisplayChange): void => {
    const edited = { ...step, change: next };
    onChange(keepable(next) ? edited : withoutKeep(edited));
  };
  return (
    <View className="gap-3">
      <ComputerSelect
        catalog={catalog}
        computer={step.computer}
        onChange={(computer) => {
          onChange({ ...step, computer });
        }}
      />
      <Select
        label="What to change"
        value={step.change.action}
        options={DISPLAY_ACTIONS.filter(
          (action) =>
            action.value === step.change.action ||
            displayActionOffered(choices.features, action.value),
        )}
        onChange={(action) => {
          change(blankDisplayChange(action));
        }}
      />
      <ChangeFields change={step.change} choices={choices} onChange={change} />
      <KeepRow step={step} onChange={onChange} />
    </View>
  );
}
