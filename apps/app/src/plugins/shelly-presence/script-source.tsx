import { ScriptLibrary } from './script-library';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { SwitchRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { useScriptSource, type ScriptSourceDraft } from './use-script-source';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';

function ScriptStatus({ status }: { readonly status: ScriptSourceDraft['status'] }): ReactNode {
  if (status === null) return null;
  return (
    <List title="Script runtime">
      <ValueRow title="State" value={status.running ? 'Running' : 'Stopped'} />
      <ValueRow title="Errors" value={(status.errors ?? []).join(', ') || 'None reported'} />
      <ValueRow
        title="Memory used"
        value={status.mem_used === undefined ? 'Unknown' : `${String(status.mem_used)} bytes`}
      />
      <ValueRow
        title="Peak memory"
        value={status.mem_peak === undefined ? 'Unknown' : `${String(status.mem_peak)} bytes`}
      />
      <ValueRow
        title="Free memory"
        value={status.mem_free === undefined ? 'Unknown' : `${String(status.mem_free)} bytes`}
      />
      <ValueRow title="CPU" value={status.cpu === undefined ? 'Unknown' : String(status.cpu)} />
    </List>
  );
}

export function ScriptSource({
  sensor,
  id,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly id: number;
}): ReactNode {
  const draft = useScriptSource(sensor, id);
  const [append, setAppend] = useState(false);
  const operation = usePresenceOperation(sensor);
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
        <Text tone="variant">Load the accepted source or import a file before editing.</Text>
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
          if (draft.source !== null)
            void operation.run({ action: 'script_put_code', id, code: draft.source, append });
        }}
      />
      {draft.error === null ? null : <Text tone="critical">{draft.error}</Text>}
      <OperationFeedback operation={operation} />
      <ScriptLibrary sensor={sensor} change={draft.change} />
      <ScriptStatus status={draft.status} />
    </View>
  );
}
