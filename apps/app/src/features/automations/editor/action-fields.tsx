import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Action, CommandAction, SceneRow } from '@smarteverything/domain';
import type { Catalog } from '../data/use-automations';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { commandAction } from '../model/blanks';
import { writableCapabilities, type DeviceLike } from '../model/capability-choices';
import { capabilityLabel } from '../model/present';
import { MissingTarget, TargetFields, targetOf } from './target-fields';
import { DurationField, type DurationUnits } from './time-fields';
import { ValueInput } from './value-input';
import { ToolActionSummary, WakeFields } from './wake-fields';

const SECOND_UNITS: DurationUnits = [
  { value: 'seconds', label: 's', size: 1 },
  { value: 'minutes', label: 'min', size: 60 },
  { value: 'hours', label: 'h', size: 3600 },
];

function CommandValue({
  action,
  devices,
  onChange,
}: {
  readonly action: CommandAction;
  readonly devices: readonly DeviceLike[];
  readonly onChange: (action: CommandAction) => void;
}): ReactNode {
  const target = targetOf(devices, action.deviceId, action.capability);
  if (target === null) {
    return <MissingTarget />;
  }
  const descriptor = target.capability.value;
  if (descriptor.kind === 'action' && descriptor.arguments === undefined) {
    return (
      <Text variant="callout" tone="variant">
        {`Runs “${capabilityLabel(target.device, target.capability)}”.`}
      </Text>
    );
  }
  return (
    <ValueInput
      device={target.device}
      capability={target.capability}
      label="Set to"
      value={action.value}
      onChange={(value) => {
        onChange({ ...action, value });
      }}
    />
  );
}

export function CommandFields({
  action,
  devices,
  onChange,
}: {
  readonly action: CommandAction;
  readonly devices: readonly DeviceLike[];
  readonly onChange: (action: CommandAction) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <TargetFields
        devices={devices}
        usable={writableCapabilities}
        deviceId={action.deviceId}
        capability={action.capability}
        onTarget={(device, capability) => {
          onChange(commandAction(device, capability));
        }}
      />
      <CommandValue action={action} devices={devices} onChange={onChange} />
    </View>
  );
}

function SceneField({
  action,
  scenes,
  onChange,
}: {
  readonly action: Extract<Action, { type: 'scene' }>;
  readonly scenes: readonly SceneRow[];
  readonly onChange: (action: Action) => void;
}): ReactNode {
  return (
    <Select
      label="Scene"
      placeholder="Pick a scene"
      value={scenes.some((scene) => scene.id === action.sceneId) ? action.sceneId : null}
      options={scenes.map((scene) => ({ value: scene.id, label: scene.name }))}
      onChange={(sceneId) => {
        onChange({ ...action, sceneId });
      }}
    />
  );
}

export function ActionFields({
  action,
  catalog,
  onChange,
}: {
  readonly action: Action;
  readonly catalog: Catalog;
  readonly onChange: (action: Action) => void;
}): ReactNode {
  switch (action.type) {
    case 'command':
      return <CommandFields action={action} devices={catalog.devices} onChange={onChange} />;
    case 'scene':
      return <SceneField action={action} scenes={catalog.scenes} onChange={onChange} />;
    case 'delay':
      return (
        <DurationField
          label="Wait"
          value={action.seconds}
          units={SECOND_UNITS}
          max={86_400}
          onChange={(seconds) => {
            onChange({ ...action, seconds });
          }}
        />
      );
    case 'notify':
      return (
        <TextField
          label="Message"
          value={action.message}
          helper="Shows on your phones and in Activity."
          onChange={(message) => {
            onChange({ ...action, message });
          }}
        />
      );
    case 'wake_ai':
      return <WakeFields action={action} catalog={catalog} onChange={onChange} />;
    case 'tool':
      return <ToolActionSummary action={action} catalog={catalog} />;
  }
}
