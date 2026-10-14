import { presenceActionAvailable } from './availability';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  SHELLY_PRESENCE_ACTION,
  type JsonValue,
  type ShellyPresenceDevice,
  type ShellyVirtualComponent,
} from '@smarteverything/domain';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';
import { MemberInput } from './member-input';

function reportedValue(component: ShellyVirtualComponent): JsonValue {
  return component.component === 'button' ? null : (component.status?.value ?? null);
}

function ValueInput({
  component,
  value,
  change,
  sensor,
}: {
  readonly component: ShellyVirtualComponent;
  readonly value: JsonValue;
  readonly change: (value: JsonValue) => void;
  readonly sensor: ShellyPresenceDevice;
}): ReactNode {
  switch (component.component) {
    case 'boolean':
      return <BooleanValue value={value} change={change} />;
    case 'enum':
      return (
        <View className="gap-2">
          <Select
            label="Value"
            value={typeof value === 'string' ? value : null}
            options={component.config.options.map((option) => ({ value: option, label: option }))}
            onChange={change}
          />
          <Button
            label="Clear enum value draft"
            variant="text"
            onPress={() => {
              change(null);
            }}
          />
        </View>
      );
    case 'text':
    case 'number':
      return (
        <ScalarValue numeric={component.component === 'number'} value={value} change={change} />
      );
    case 'group':
      return <MemberInput value={value} keys={sensor.componentKeys} change={change} />;
    case 'button':
      return null;
  }
}

export function VirtualValue({
  sensor,
  component,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly component: ShellyVirtualComponent;
}): ReactNode {
  const [value, setValue] = useState<JsonValue>(reportedValue(component));
  const [error, setError] = useState<string | null>(null);
  const operation = usePresenceOperation(sensor);
  const save = (): void => {
    const next =
      component.component === 'number' && typeof value === 'string'
        ? value === ''
          ? null
          : Number(value)
        : value;
    const parsed = SHELLY_PRESENCE_ACTION.safeParse({
      action: 'virtual_set',
      id: component.config.id,
      setting: { component: component.component, value: next },
    });
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setError(null);
    void operation.run(parsed.data);
  };
  return (
    <View className="gap-3">
      <ValueInput sensor={sensor} component={component} value={value} change={setValue} />
      {component.component === 'button' ? (
        <ButtonActions sensor={sensor} id={component.config.id} />
      ) : (
        <Button label="Set value" onPress={save} loading={operation.busy} />
      )}
      {error === null ? null : <Text tone="critical">{error}</Text>}
      <ToggleValue sensor={sensor} component={component} />
      <OperationFeedback operation={operation} />
    </View>
  );
}

function ButtonActions({
  sensor,
  id,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly id: number;
}): ReactNode {
  const operation = usePresenceOperation(sensor);
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {(['single_push', 'double_push', 'triple_push', 'long_push'] as const).map((event) => (
          <Button
            key={event}
            label={event.replaceAll('_', ' ')}
            variant="tonal"
            onPress={() => {
              void operation.run({ action: 'virtual_button', id, event });
            }}
          />
        ))}
      </View>
      <OperationFeedback operation={operation} />
    </View>
  );
}

function BooleanValue({
  value,
  change,
}: {
  readonly value: JsonValue;
  readonly change: (value: JsonValue) => void;
}): ReactNode {
  return (
    <Select
      label="Value"
      value={value === null ? null : value === true ? 'true' : 'false'}
      options={[
        { value: 'true', label: 'True' },
        { value: 'false', label: 'False' },
      ]}
      onChange={(next) => {
        change(next === 'true');
      }}
    />
  );
}
function ScalarValue({
  numeric,
  value,
  change,
}: {
  readonly numeric: boolean;
  readonly value: JsonValue;
  readonly change: (value: JsonValue) => void;
}): ReactNode {
  return (
    <TextField
      label="Value"
      kind={numeric ? 'number' : 'text'}
      value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
      onChange={change}
    />
  );
}
function ToggleValue({
  sensor,
  component,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly component: ShellyVirtualComponent;
}): ReactNode {
  const operation = usePresenceOperation(sensor);
  return component.component === 'boolean' ? (
    <View className="gap-2">
      <Button
        label="Toggle value"
        variant="tonal"
        disabled={!presenceActionAvailable(sensor, 'virtual_toggle')}
        onPress={() => {
          void operation.run({ action: 'virtual_toggle', id: component.config.id });
        }}
      />
      <OperationFeedback operation={operation} />
    </View>
  ) : null;
}
