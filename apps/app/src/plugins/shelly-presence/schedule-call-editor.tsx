import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Select } from '../../components/select';
import { SwitchRow } from '../../components/rows';
import { TextField } from '../../components/text-field';
import { PresenceFieldInput } from './presence-fields';
import {
  callFields,
  callFieldValue,
  changeCallField,
  numberParameter,
  SCHEDULE_METHODS,
  type CallDraft,
} from './schedule-calls';

interface CallProps {
  readonly call: CallDraft;
  readonly change: (value: CallDraft) => void;
}
function ConfigCallFields({ call, change }: CallProps): ReactNode {
  const idRequired = [
    'PresenceZone.SetConfig',
    'Illuminance.SetConfig',
    'Script.Start',
    'Script.Stop',
  ].includes(call.method);
  return (
    <View className="gap-3">
      {idRequired ? (
        <TextField
          label="Component ID"
          kind="number"
          value={numberParameter(call.params['id'])}
          onChange={(id) => {
            change({ ...call, params: { ...call.params, id } });
          }}
        />
      ) : null}
      {callFields(call.method).map((field) => (
        <PresenceFieldInput
          key={field.id}
          field={field}
          value={callFieldValue(call, field)}
          change={(value) => {
            change(changeCallField(call, field, value));
          }}
        />
      ))}
    </View>
  );
}
function CallParameters(props: CallProps): ReactNode {
  const { call, change } = props;
  if (call.method === 'Presence.SetSensor')
    return (
      <SwitchRow
        title="Detection enabled"
        value={call.params['enable'] === true}
        onChange={(enable) => {
          change({ ...call, params: { enable } });
        }}
      />
    );
  if (call.method === 'Shelly.Reboot')
    return (
      <TextField
        label="Restart delay (milliseconds)"
        kind="number"
        value={numberParameter(call.params['delay_ms'])}
        onChange={(delay) => {
          change({ ...call, params: { delay_ms: delay } });
        }}
      />
    );
  return <ConfigCallFields {...props} />;
}
function CallCard({
  call,
  index,
  earlier,
  remove,
  change,
}: CallProps & {
  readonly index: number;
  readonly earlier: () => void;
  readonly remove: () => void;
}): ReactNode {
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <Select
        label={`Action ${String(index + 1)}`}
        value={call.method}
        options={SCHEDULE_METHODS.map((method) => ({
          value: method,
          label: method.replaceAll('.', ' · '),
        }))}
        onChange={(method) => {
          change({ method, params: method === 'Presence.SetSensor' ? { enable: true } : {} });
        }}
      />
      <CallParameters call={call} change={change} />
      <View className="flex-row gap-2">
        <Button label="Move earlier" variant="text" disabled={index === 0} onPress={earlier} />
        <Button label="Remove action" variant="text" onPress={remove} />
      </View>
    </View>
  );
}

export function ScheduleCallEditor({
  value,
  change,
}: {
  readonly value: readonly CallDraft[];
  readonly change: (value: readonly CallDraft[]) => void;
}): ReactNode {
  const earlier = (index: number): void => {
    const call = value[index];
    const previous = value[index - 1];
    if (call === undefined || previous === undefined) return;
    change(value.map((item, at) => (at === index - 1 ? call : at === index ? previous : item)));
  };
  return (
    <View className="gap-3">
      {value.map((call, index) => (
        <CallCard
          key={index}
          call={call}
          index={index}
          change={(next) => {
            change(value.map((item, at) => (at === index ? next : item)));
          }}
          earlier={() => {
            earlier(index);
          }}
          remove={() => {
            change(value.filter((_, at) => at !== index));
          }}
        />
      ))}
      <Button
        label="Add action"
        icon="plus"
        variant="tonal"
        disabled={value.length >= 20}
        onPress={() => {
          change([...value, { method: 'Presence.SetSensor', params: { enable: true } }]);
        }}
      />
    </View>
  );
}
