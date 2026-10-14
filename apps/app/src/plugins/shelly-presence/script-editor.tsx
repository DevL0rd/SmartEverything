import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice, ShellyResources } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { SwitchRow } from '../../components/rows';
import { TextField } from '../../components/text-field';
import { ScriptSource } from './script-source';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';

export type ScriptRow = NonNullable<ShellyResources['scripts']>['scripts'][number];
function ScriptIdentity({
  sensor,
  row,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly row: ScriptRow;
}): ReactNode {
  const [name, setName] = useState(row.name ?? '');
  const [enable, setEnable] = useState(row.enable === true);
  const [capturedRevision] = useState(sensor.revision);
  const operation = usePresenceOperation(sensor);
  const revision = operation.acceptedRevision ?? capturedRevision;
  return (
    <View className="gap-3">
      <TextField label="Script name" value={name} onChange={setName} />
      <SwitchRow title="Run on device boot" value={enable} onChange={setEnable} />
      <Button
        label="Save script settings"
        disabled={revision !== sensor.revision}
        variant="tonal"
        onPress={() => {
          void operation.run({
            action: 'script_config',
            id: row.id,
            config: { name, enable },
            ...(revision === null ? {} : { expectedRevision: revision }),
          });
        }}
      />
      <OperationFeedback operation={operation} />
    </View>
  );
}
function ScriptExecution({
  sensor,
  id,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly id: number;
}): ReactNode {
  const [expression, setExpression] = useState('');
  const operation = usePresenceOperation(sensor);
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Start script"
          icon="play"
          variant="tonal"
          onPress={() => {
            void operation.run({ action: 'script_start', id });
          }}
        />
        <Button
          label="Stop script"
          icon="pause"
          variant="tonal"
          onPress={() => {
            void operation.run({ action: 'script_stop', id });
          }}
        />
      </View>
      <TextField
        label="Expression to evaluate"
        multiline
        value={expression}
        onChange={setExpression}
      />
      <Button
        label="Evaluate expression"
        variant="tonal"
        disabled={expression === ''}
        onPress={() => {
          void operation.run({ action: 'script_eval', id, code: expression });
        }}
      />
      <OperationFeedback operation={operation} />
    </View>
  );
}

export function ScriptEditor({
  sensor,
  row,
  close,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly row: ScriptRow;
  readonly close: () => void;
}): ReactNode {
  const operation = usePresenceOperation(sensor);
  return (
    <View className="gap-section-gap">
      <ScriptIdentity sensor={sensor} row={row} />
      <ScriptSource sensor={sensor} id={row.id} />
      <ScriptExecution sensor={sensor} id={row.id} />
      <Button
        label="Delete script"
        variant="destructive"
        onPress={() => {
          void operation.run({ action: 'script_delete', id: row.id }).then((saved) => {
            if (saved) close();
          });
        }}
      />
      <OperationFeedback operation={operation} />
      <Button label="Back" variant="text" onPress={close} />
    </View>
  );
}
