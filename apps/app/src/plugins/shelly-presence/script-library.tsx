import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyDevice } from '@smarteverything/shelly';
import { z } from 'zod';
import { Button } from '../../components/button';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { OperationFeedback } from './operation-feedback';
import { actionAvailable } from './presence-operation';
import { usePresenceOperation } from './use-presence-operation';
import { background } from '@smarteverything/logging';

const LIBRARY = z.object({
  examples: z.array(
    z.object({
      fname: z.string(),
      title: z.string(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  ),
});
const EXAMPLE = z.object({ fname: z.string(), code: z.string() });

function ExampleSource({
  code,
  fname,
  change,
}: {
  readonly code: string;
  readonly fname: string;
  readonly change: (code: string) => void;
}): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="body-strong">{fname}</Text>
      <Text selectable className="font-mono" variant="callout">
        {code}
      </Text>
      <Button
        label="Use this source draft"
        variant="tonal"
        onPress={() => {
          change(code);
        }}
      />
      <Text variant="footnote" tone="variant">
        Review the source, then save it explicitly. Starting the script is a separate action.
      </Text>
    </View>
  );
}

export function ScriptLibrary({
  sensor,
  change,
}: {
  readonly sensor: ShellyDevice;
  readonly change: (code: string) => void;
}): ReactNode {
  const library = usePresenceOperation(sensor);
  const example = usePresenceOperation(sensor);
  const [selected, setSelected] = useState<string | null>(null);
  const entries = LIBRARY.safeParse(library.result);
  const source = EXAMPLE.safeParse(example.result);
  return (
    <View className="gap-3">
      <Button
        label="Browse Shelly script library"
        variant="tonal"
        loading={library.busy}
        disabled={!actionAvailable(sensor, 'script_library')}
        onPress={() => {
          background(library.run({ action: 'script_library' }), 'library.run_failed');
        }}
      />
      <OperationFeedback operation={library} />
      {!entries.success ? null : (
        <List title="Script examples">
          {entries.data.examples.map((entry) => (
            <NavRow
              key={entry.fname}
              title={entry.title}
              subtitle={entry.description ?? entry.tags?.join(', ') ?? ''}
              onPress={() => {
                setSelected(entry.fname);
                background(
                  example.run({ action: 'script_example', params: { fname: entry.fname } }),
                  'example.run_failed',
                );
              }}
            />
          ))}
        </List>
      )}
      {!source.success || source.data.fname !== selected ? null : (
        <ExampleSource code={source.data.code} fname={source.data.fname} change={change} />
      )}
      <OperationFeedback operation={example} />
    </View>
  );
}
