import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyOperationResult } from '@smarteverything/domain';
import { NavRow } from '../../components/rows';
import { Button } from '../../components/button';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { TextExportButton } from './text-export-button';
import type { PresenceOperation } from './use-presence-operation';
export function LogFilesResult({
  result,
  run,
}: {
  readonly result: ShellyOperationResult;
  readonly run: PresenceOperation['run'];
}): ReactNode {
  if (result.kind === 'device_log_files')
    return (
      <View className="gap-2">
        <List title="Saved device logs">
          {result.value.files.map((file) => (
            <NavRow
              key={file.path}
              title={file.name}
              onPress={() => {
                void run({ action: 'device_log_file', path: file.path });
              }}
            />
          ))}
        </List>
        {result.value.files.length === 0 ? (
          <Text tone="variant">No saved log files were returned.</Text>
        ) : null}
      </View>
    );
  if (result.kind !== 'device_log_file') return null;
  return (
    <View className="gap-3">
      <Text variant="body-strong">{result.value.name}</Text>
      <Text selectable className="font-mono" variant="callout">
        {result.value.text}
      </Text>
      <TextExportButton
        name={result.value.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}
        title="Export saved log file"
        content={result.value.text}
      />
      <Button
        label="Back to saved log files"
        variant="text"
        onPress={() => {
          void run({ action: 'device_log_files' });
        }}
      />
    </View>
  );
}
