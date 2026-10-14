import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';
import { presenceActionAvailable } from './availability';

interface ScriptLibraryProps {
  readonly sensor: ShellyPresenceDevice;
  readonly change: (code: string) => void;
}
export function ScriptLibrary({ sensor, change }: ScriptLibraryProps): ReactNode {
  const library = usePresenceOperation(sensor);
  const example = usePresenceOperation(sensor);
  const [selected, setSelected] = useState<string | null>(null);
  const source = example.result?.kind === 'script_example' ? example.result.value : null;
  return (
    <View className="gap-3">
      <Button
        label="Browse Shelly script library"
        variant="tonal"
        loading={library.busy}
        disabled={!presenceActionAvailable(sensor, 'script_library')}
        onPress={() => {
          void library.run({ action: 'script_library' });
        }}
      />
      <ExampleList
        operation={library}
        choose={(fname) => {
          setSelected(fname);
          void example.run({ action: 'script_example', fname });
        }}
      />
      <OperationFeedback operation={library} />
      {source?.fname !== selected ? null : (
        <View className="gap-2">
          <Text variant="body-strong">{source.fname}</Text>
          <Text selectable className="font-mono" variant="callout">
            {source.code}
          </Text>
          <Button
            label="Use this source draft"
            variant="tonal"
            onPress={() => {
              change(source.code);
            }}
          />
          <Text variant="footnote" tone="variant">
            Review the source, then save it explicitly. Starting the script is a separate action.
          </Text>
        </View>
      )}
      <ExampleError error={example.error} />
    </View>
  );
}

function ExampleList({
  operation,
  choose,
}: {
  readonly operation: ReturnType<typeof usePresenceOperation>;
  readonly choose: (fname: string) => void;
}): ReactNode {
  const entries =
    operation.result?.kind === 'script_library' ? operation.result.value.examples : [];
  return entries.length === 0 ? null : (
    <List title="Script examples">
      {entries.map((entry) => (
        <NavRow
          key={entry.fname}
          title={entry.title}
          subtitle={entry.description ?? entry.tags?.join(', ') ?? ''}
          onPress={() => {
            choose(entry.fname);
          }}
        />
      ))}
    </List>
  );
}

function ExampleError({ error }: { readonly error: string | null }): ReactNode {
  return error === null ? null : <Text tone="critical">{error}</Text>;
}
