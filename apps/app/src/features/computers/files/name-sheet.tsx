import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { nameError } from './file-model';

export function NameSheet({
  title,
  label,
  initial,
  helper,
  confirmLabel,
  onSubmit,
  onClose,
}: {
  readonly title: string;
  readonly label: string;
  readonly initial: string;
  readonly helper: string;
  readonly confirmLabel: string;
  readonly onSubmit: (name: string) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [text, setText] = useState(initial);
  const name = text.trim();
  const error = nameError(text);
  const ready = name !== '' && error === null && name !== initial;
  const submit = (): void => {
    if (!ready) return;
    onSubmit(name);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={title} detents={['half']}>
      <View className="gap-3 px-4 pb-6">
        <TextField
          label={label}
          value={text}
          onChange={setText}
          onSubmit={submit}
          helper={helper}
          error={error}
          focusOnMount
        />
        <Button label={confirmLabel} grow size="lg" disabled={!ready} onPress={submit} />
      </View>
    </Sheet>
  );
}
