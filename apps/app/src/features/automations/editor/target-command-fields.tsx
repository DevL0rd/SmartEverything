import type { ReactNode } from 'react';
import { View } from 'react-native';
import { targetDevices, type Action } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { SwitchRow } from '../../../components/rows';
import { groupControlChoices } from '../../device-groups';
import type { Catalog } from '../data/use-automations';
import { defaultValue } from '../model/capability-choices';
import { commandBinding } from '../model/command-input';
import { ValueInput } from './value-input';
import { ProgramTargetPicker } from './program-target-picker';
import { CommandBindingFields } from './command-binding-fields';

type TargetCommand = Extract<Action, { type: 'target_command' }>;
interface TargetCommandFieldsProps {
  readonly action: TargetCommand;
  readonly catalog: Catalog;
  readonly onChange: (action: TargetCommand) => void;
}
function controlsFor(
  action: TargetCommand,
  catalog: Catalog,
): ReturnType<typeof groupControlChoices> {
  const { target } = action;
  if (
    target.kind === 'group' &&
    !(catalog.groups ?? []).some((group) => group.id === target.groupId)
  )
    return [];
  return groupControlChoices(targetDevices(catalog.allDevices, catalog.groups ?? [], target));
}
function TargetBindingToggle({ action, catalog, onChange }: TargetCommandFieldsProps): ReactNode {
  const control = controlsFor(action, catalog).find(
    (entry) => entry.reference === action.capability,
  );
  if (control === undefined) return null;
  const binding = commandBinding(
    control.presented.capability,
    'value' in action ? action.value : undefined,
  );
  const base = {
    type: action.type,
    nodeId: action.nodeId,
    target: action.target,
    capability: action.capability,
    ...(action.scale === undefined ? {} : { scale: action.scale }),
  };
  return binding === null ? null : (
    <SwitchRow
      title="Use a typed input"
      value={'binding' in action}
      onChange={(enabled) => {
        onChange(
          enabled
            ? { ...base, binding }
            : { ...base, value: defaultValue(control.presented.capability.value) },
        );
      }}
    />
  );
}

function TargetValueFields({ action, catalog, onChange }: TargetCommandFieldsProps): ReactNode {
  const control = controlsFor(action, catalog).find(
    (entry) => entry.reference === action.capability,
  );
  if (control === undefined)
    return (
      <Text variant="callout" tone="critical">
        The target or control is unavailable. Its saved settings are preserved.
      </Text>
    );
  return (
    <>
      <TargetBindingToggle action={action} catalog={catalog} onChange={onChange} />
      {'binding' in action ? (
        <CommandBindingFields
          binding={action.binding}
          capability={control.presented.capability}
          device={control.device}
          catalog={catalog}
          onChange={(next) => {
            onChange({ ...action, binding: next });
          }}
        />
      ) : (
        <ValueInput
          label="Set to"
          device={control.device}
          capability={control.presented.capability}
          value={action.value}
          onChange={(value) => {
            onChange({ ...action, value });
          }}
        />
      )}
    </>
  );
}
export function TargetCommandFields({
  action,
  catalog,
  onChange,
}: TargetCommandFieldsProps): ReactNode {
  const controls = controlsFor(action, catalog);
  return (
    <View className="gap-3">
      <ProgramTargetPicker
        target={action.target}
        catalog={catalog}
        onChange={(target) => {
          onChange({ ...action, target });
        }}
      />
      <Select
        label="Control"
        value={action.capability}
        options={controls.map((entry) => ({
          value: entry.reference,
          label: entry.presented.label,
        }))}
        onChange={(capability) => {
          const next = controls.find((entry) => entry.reference === capability);
          if (next !== undefined)
            onChange({
              type: 'target_command',
              nodeId: action.nodeId,
              target: action.target,
              capability,
              ...(next.presented.role === 'brightness' ? ({ scale: 'percent' } as const) : {}),
              value: defaultValue(next.presented.capability.value),
            });
        }}
      />
      <TargetValueFields action={action} catalog={catalog} onChange={onChange} />
      <Text variant="footnote" tone="variant">
        One shared value is sent to supported members. A device-state input is read from the
        explicit source you choose.
      </Text>
    </View>
  );
}
