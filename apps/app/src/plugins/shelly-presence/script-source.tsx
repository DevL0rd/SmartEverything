import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyDevice } from '@smarteverything/shelly';
import { Button } from '../../components/button';
import { SwitchRow } from '../../components/rows';
import { Text } from '../../components/text';
import { TextField } from '../../components/text-field';
import { OperationFeedback } from './operation-feedback';
import { ValueTree } from './result-view';
import { ScriptLibrary } from './script-library';
import { useScriptSource } from './use-script-source';
import { usePresenceOperation } from './use-presence-operation';
import { background } from '@smarteverything/logging';

export function ScriptSource({
  sensor,
  id,
}: {
  readonly sensor: ShellyDevice;
  readonly id: number;
}): ReactNode {
  const draft = useScriptSource(sensor, id);
  const [append, setAppend] = useState(false);
  const operation = usePresenceOperation(sensor);
  const save = (): Promise<boolean> =>
    operation.run({ action: 'script_put_code', params: { id, code: draft.source ?? '', append } });
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        <Button label="Load source" variant="tonal" onPress={draft.load} />
        <Button
          label="Import JavaScript"
          icon="upload"
          variant="tonal"
          onPress={draft.importFile}
        />
      </View>
      {draft.source === null ? (
        <Text tone="variant">Load the source from the device or import a file before editing.</Text>
      ) : (
        <TextField
          label="JavaScript source"
          multiline
          value={draft.source}
          onChange={draft.change}
        />
      )}
      <SwitchRow title="Append to existing source" value={append} onChange={setAppend} />
      <Button
        label="Save source"
        disabled={draft.source === null || draft.source.length === 0}
        loading={operation.busy}
        onPress={() => {
          background(save(), 'script_source.save_failed');
        }}
      />
      {draft.error === null ? null : <Text tone="critical">{draft.error}</Text>}
      <OperationFeedback operation={operation} />
      <ScriptLibrary sensor={sensor} change={draft.change} />
      {draft.status === null ? null : <ValueTree value={draft.status} />}
    </View>
  );
}
