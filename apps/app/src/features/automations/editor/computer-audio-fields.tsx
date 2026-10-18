import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AudioChange } from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { Select } from '../../../components/select';
import { useComputerChoices, type ComputerChoices } from '../data/use-computer-choices';
import type { Catalog } from '../data/use-automations';
import {
  AUDIO_ACTIONS,
  audioActionOffered,
  blankAudioChange,
  offers,
  type AudioStep,
} from '../model/computer-steps';
import { ComputerSelect, LevelField, NameField } from './computer-fields';

interface AudioFieldsProps {
  readonly catalog: Catalog;
  readonly step: AudioStep;
  readonly onChange: (step: AudioStep) => void;
}

interface DetailProps {
  readonly change: AudioChange;
  readonly choices: ComputerChoices;
  readonly onChange: (change: AudioChange) => void;
}

const KIND_OPTIONS = [
  { value: 'output', label: 'Speakers and headphones' },
  { value: 'input', label: 'Microphone' },
] as const;

function KindSelect({
  change,
  choices,
  onChange,
}: DetailProps & {
  readonly change: Extract<AudioChange, { kind: 'output' | 'input' }>;
}): ReactNode {
  return (
    <Select
      label="Which sound"
      value={change.kind}
      options={KIND_OPTIONS.filter(
        (option) => option.value === change.kind || offers(choices.features, 'microphone'),
      )}
      onChange={(kind) => {
        if (change.action === 'default') onChange({ ...change, kind, device: '' });
        else {
          const { device: _device, ...rest } = change;
          onChange({ ...rest, kind });
        }
      }}
    />
  );
}

function DeviceField({
  change,
  choices,
  onChange,
}: DetailProps & {
  readonly change: Extract<AudioChange, { action: 'volume' | 'mute' }>;
}): ReactNode {
  return (
    <NameField
      label="Device"
      value={change.device ?? ''}
      names={change.kind === 'input' ? choices.inputs : choices.outputs}
      helper="Leave empty for the default device. Use the name on the computer’s Audio page."
      anyLabel="The default device"
      onChange={(device) => {
        const { device: _device, ...rest } = change;
        onChange(device === '' ? rest : { ...rest, device });
      }}
    />
  );
}

function WholeSound({ change, choices, onChange }: DetailProps): ReactNode {
  if (change.action === 'volume')
    return (
      <>
        <KindSelect change={change} choices={choices} onChange={onChange} />
        <DeviceField change={change} choices={choices} onChange={onChange} />
        <LevelField
          label="Volume"
          unit="%"
          value={change.level}
          onChange={(level) => {
            onChange({ ...change, level });
          }}
        />
      </>
    );
  if (change.action === 'mute')
    return (
      <>
        <KindSelect change={change} choices={choices} onChange={onChange} />
        <DeviceField change={change} choices={choices} onChange={onChange} />
        <SwitchRow
          title="Muted"
          subtitle="Off unmutes it."
          value={change.muted}
          onChange={(muted) => {
            onChange({ ...change, muted });
          }}
        />
      </>
    );
  return null;
}

function DefaultDevice({ change, choices, onChange }: DetailProps): ReactNode {
  if (change.action !== 'default') return null;
  return (
    <>
      <KindSelect change={change} choices={choices} onChange={onChange} />
      <NameField
        label="Make this the default"
        value={change.device}
        names={change.kind === 'input' ? choices.inputs : choices.outputs}
        helper="Use the name on the computer’s Audio page."
        onChange={(device) => {
          onChange({ ...change, device });
        }}
      />
    </>
  );
}

function AppSound({ change, choices, onChange }: DetailProps): ReactNode {
  if (
    change.action !== 'app_volume' &&
    change.action !== 'app_mute' &&
    change.action !== 'app_output'
  )
    return null;
  return (
    <>
      <NameField
        label="App"
        value={change.app}
        names={choices.apps}
        helper="The app’s name as the computer’s Audio page shows it while it plays."
        onChange={(app) => {
          onChange({ ...change, app });
        }}
      />
      <AppChange change={change} choices={choices} onChange={onChange} />
    </>
  );
}

function AppChange({
  change,
  choices,
  onChange,
}: DetailProps & {
  readonly change: Extract<AudioChange, { action: 'app_volume' | 'app_mute' | 'app_output' }>;
}): ReactNode {
  if (change.action === 'app_volume')
    return (
      <LevelField
        label="Volume"
        unit="%"
        value={change.level}
        onChange={(level) => {
          onChange({ ...change, level });
        }}
      />
    );
  if (change.action === 'app_mute')
    return (
      <SwitchRow
        title="Muted"
        subtitle="Off unmutes it."
        value={change.muted}
        onChange={(muted) => {
          onChange({ ...change, muted });
        }}
      />
    );
  return (
    <NameField
      label="Play it through"
      value={change.output}
      names={choices.outputs}
      helper="Use the output’s name on the computer’s Audio page."
      onChange={(output) => {
        onChange({ ...change, output });
      }}
    />
  );
}

export function ComputerAudioFields({ catalog, step, onChange }: AudioFieldsProps): ReactNode {
  const device = catalog.allDevices.find((candidate) => candidate.id === step.computer);
  const choices = useComputerChoices(step.computer, device?.online === true);
  const change = (next: AudioChange): void => {
    onChange({ ...step, change: next });
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
        options={AUDIO_ACTIONS.filter(
          (action) =>
            action.value === step.change.action ||
            audioActionOffered(choices.features, action.value),
        )}
        onChange={(action) => {
          change(blankAudioChange(action));
        }}
      />
      <WholeSound change={step.change} choices={choices} onChange={change} />
      <DefaultDevice change={step.change} choices={choices} onChange={change} />
      <AppSound change={step.change} choices={choices} onChange={change} />
    </View>
  );
}
