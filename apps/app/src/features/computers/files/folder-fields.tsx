import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { TextField } from '../../../components/text-field';
import { isUsablePath, newFolderError } from './path-model';

export function PathField({
  machine,
  onGo,
}: {
  readonly machine: string;
  readonly onGo: (path: string) => void;
}): ReactNode {
  const [text, setText] = useState('');
  const valid = isUsablePath(text);
  const submit = (): void => {
    if (valid) onGo(text.trim());
  };
  return (
    <View className="gap-2">
      <TextField
        label={`Path on ${machine}`}
        value={text}
        onChange={setText}
        onSubmit={submit}
        placeholder="/home/you/projects"
        helper="Start with / and the full folder path."
        error={text === '' || valid ? null : 'Use a path that starts with /.'}
        focusOnMount
      />
      <Button label="Go to path" variant="tonal" disabled={!valid} onPress={submit} />
    </View>
  );
}

export function NewFolderField({
  folder,
  onCreate,
}: {
  readonly folder: string;
  readonly onCreate: (name: string) => void;
}): ReactNode {
  const [text, setText] = useState('');
  const error = newFolderError(folder, text);
  const ready = text.trim() !== '' && error === null;
  const submit = (): void => {
    if (ready) onCreate(text.trim());
  };
  return (
    <View className="gap-2">
      <TextField
        label="New folder name"
        value={text}
        onChange={setText}
        onSubmit={submit}
        helper={`Created inside ${folder}`}
        error={error}
        focusOnMount
      />
      <Button label="Create and choose" variant="tonal" disabled={!ready} onPress={submit} />
    </View>
  );
}
