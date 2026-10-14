import { usePresenceSelection } from './use-presence-selection';
import { useState, type ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { List } from '../../components/section';
import { NavRow } from '../../components/rows';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';
import { ScriptEditor } from './script-editor';
import { presenceActionAvailable } from './availability';

function NewScript({
  sensor,
  focused,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly focused: boolean;
}): ReactNode {
  const [name, setName] = useState('');
  const operation = usePresenceOperation(sensor);
  const scripts = sensor.resources?.scripts?.scripts;
  return (
    <View className="gap-3">
      <TextField label="New script name" value={name} onChange={setName} focusOnMount={focused} />
      <Button
        label="Create script"
        icon="plus"
        variant="tonal"
        disabled={
          name.trim() === '' ||
          scripts === undefined ||
          scripts.length >= 10 ||
          !presenceActionAvailable(sensor, 'script_create')
        }
        onPress={() => {
          void operation.run({ action: 'script_create', name });
        }}
      />
      <OperationFeedback operation={operation} />
    </View>
  );
}

export function ScriptSettings({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  const params = useLocalSearchParams<{ readonly focus?: string; readonly item?: string }>();
  const [selected, select] = usePresenceSelection('item');
  const scripts = sensor.resources?.scripts?.scripts;
  const row = scripts?.find((script) => String(script.id) === selected);
  if (row !== undefined)
    return (
      <ScriptEditor
        key={row.id}
        sensor={sensor}
        row={row}
        close={() => {
          select(null);
        }}
      />
    );
  return (
    <View className="gap-section-gap">
      <List title="Scripts">
        {scripts?.map((script) => (
          <NavRow
            key={script.id}
            title={script.name ?? `Script ${String(script.id)}`}
            subtitle={
              script.running === undefined
                ? 'State unknown'
                : script.running
                  ? 'Running'
                  : 'Stopped'
            }
            onPress={() => {
              select(String(script.id));
            }}
          />
        ))}
      </List>
      <NewScript sensor={sensor} focused={params.focus === 'create'} />
      {scripts === undefined ? (
        <Text tone="variant">Script inventory unavailable. Refresh the sensor.</Text>
      ) : null}
    </View>
  );
}
