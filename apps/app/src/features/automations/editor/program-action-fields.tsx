import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LEGACY_ACTION, type Action, type LegacyAction } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { Select } from '../../../components/select';
import { SwitchRow } from '../../../components/rows';
import type { Catalog } from '../data/use-automations';
import { writableCapabilities } from '../model/capability-choices';
import { defaultOperation } from '../model/value-content';
import { ActionFields } from './action-fields';
import { TargetFields } from './target-fields';
import { CommandBindingFields } from './command-binding-fields';
import { commandBinding } from '../model/command-input';
import { defaultValue } from '../model/capability-choices';
import { targetOf } from './target-fields';
import { BranchFields } from './branch-fields';
import { RepeatFields } from './repeat-fields';
import { SequenceCallFields } from './sequence-call-fields';
import { StopFields } from './stop-fields';
import { TargetCommandFields } from './target-command-fields';
import { ValueLibraryButtons } from './library-buttons';
import { ValueOperationFields } from './value-operation-fields';

type ValueUpdate = Extract<Action, { type: 'value_update' }>;

interface ValueUpdateFieldsProps {
  readonly action: ValueUpdate;
  readonly catalog: Catalog;
  readonly onChange: (action: ValueUpdate) => void;
}

function ValueUpdateFields({ action, catalog, onChange }: ValueUpdateFieldsProps): ReactNode {
  const row = catalog.values?.find((value) => value.id === action.valueId);
  return (
    <View className="gap-3">
      <Select
        label="Value"
        searchable
        value={action.valueId}
        options={(catalog.values ?? []).map((entry) => ({
          value: entry.id,
          label: entry.content.name,
        }))}
        onChange={(id) => {
          const selected = catalog.values?.find((entry) => entry.id === id);
          if (selected !== undefined)
            onChange({
              ...action,
              valueId: selected.id,
              operation: defaultOperation(selected.content),
            });
        }}
      />
      <ValueLibraryButtons
        row={row ?? null}
        kind={row?.content.kind ?? 'boolean'}
        onSelect={(selected) => {
          onChange({
            ...action,
            valueId: selected.id,
            operation: defaultOperation(selected.content),
          });
        }}
      />
      {row === undefined ? (
        <Text variant="callout" tone="critical">
          This Value is unavailable.
        </Text>
      ) : (
        <ValueOperationFields
          content={row.content}
          operation={action.operation}
          onChange={(operation) => {
            onChange({ ...action, operation });
          }}
        />
      )}
    </View>
  );
}

interface CommandFieldsProps {
  readonly action: Extract<Action, { type: 'command' }>;
  readonly catalog: Catalog;
  readonly onChange: (action: Action) => void;
}

function CommandInputToggle({ action, catalog, onChange }: CommandFieldsProps): ReactNode {
  const target = targetOf(catalog.allDevices, action.deviceId, action.capability);
  if (target === null) return null;
  const binding = commandBinding(target.capability, 'value' in action ? action.value : undefined);
  if (binding === null || action.nodeId === undefined) return null;
  const base = {
    type: action.type,
    nodeId: action.nodeId,
    deviceId: action.deviceId,
    capability: action.capability,
  };
  return (
    <SwitchRow
      title="Use a typed input"
      value={'binding' in action}
      onChange={(enabled) => {
        onChange(
          enabled
            ? { ...base, binding }
            : { ...base, value: defaultValue(target.capability.value) },
        );
      }}
    />
  );
}
function CommandFields(props: CommandFieldsProps): ReactNode {
  const { action, catalog, onChange } = props;
  const legacy = LEGACY_ACTION.safeParse(action);
  const target = targetOf(catalog.allDevices, action.deviceId, action.capability);
  return (
    <View className="gap-3">
      {'binding' in action ? (
        <>
          <TargetFields
            devices={catalog.devices}
            usable={writableCapabilities}
            deviceId={action.deviceId}
            capability={action.capability}
            onTarget={(device, capability) => {
              const binding = commandBinding(capability);
              if (binding === null)
                onChange({
                  type: 'command',
                  nodeId: action.nodeId,
                  deviceId: device.id,
                  capability: capability.key,
                  value: defaultValue(capability.value),
                });
              else
                onChange({ ...action, deviceId: device.id, capability: capability.key, binding });
            }}
          />
          <CommandBindingFields
            binding={action.binding}
            capability={target?.capability}
            device={target?.device}
            catalog={catalog}
            onChange={(binding) => {
              onChange({ ...action, binding });
            }}
          />
        </>
      ) : legacy.success ? (
        <ActionFields
          action={legacy.data}
          catalog={catalog}
          onChange={(next) => {
            onChange({ ...next, nodeId: action.nodeId });
          }}
        />
      ) : null}
      <CommandInputToggle {...props} />
    </View>
  );
}

interface ProgramActionFieldsProps {
  readonly action: Action;
  readonly catalog: Catalog;
  readonly onChange: (action: Action) => void;
}

function isLegacyStep(action: Action): action is Exclude<LegacyAction, { type: 'command' }> {
  return (
    action.type === 'scene' ||
    action.type === 'delay' ||
    action.type === 'notify' ||
    action.type === 'wake_ai' ||
    action.type === 'tool'
  );
}

export function ProgramActionFields({
  action,
  catalog,
  onChange,
}: ProgramActionFieldsProps): ReactNode {
  if (action.type === 'command')
    return <CommandFields action={action} catalog={catalog} onChange={onChange} />;
  if (isLegacyStep(action))
    return <ActionFields action={action} catalog={catalog} onChange={onChange} />;
  switch (action.type) {
    case 'temporary_effect':
      return (
        <Text variant="callout" tone="variant">
          This saved temporary change is preserved. Its controls become available when the connected
          hub supports temporary effects.
        </Text>
      );
    case 'choose':
      return <BranchFields action={action} catalog={catalog} onChange={onChange} />;
    case 'repeat':
      return <RepeatFields action={action} catalog={catalog} onChange={onChange} />;
    case 'sequence':
      return <SequenceCallFields action={action} catalog={catalog} onChange={onChange} />;
    case 'stop':
      return <StopFields action={action} catalog={catalog} onChange={onChange} />;
    case 'target_command':
      return <TargetCommandFields action={action} catalog={catalog} onChange={onChange} />;
    case 'value_update':
      return <ValueUpdateFields action={action} catalog={catalog} onChange={onChange} />;
  }
}
