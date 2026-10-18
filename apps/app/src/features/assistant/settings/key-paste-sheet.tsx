import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { errorText } from '../../../format/errors';
import { background } from '@smarteverything/logging';

export interface KeyPasteSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly placeholder: string;
  readonly helper: string;
  readonly saved: string;
  readonly valid: (key: string) => boolean;
  readonly save: (key: string) => Promise<unknown>;
}

export const MEMBER_FOOTER = 'Only the owner can change keys.';

export async function runKeyAction(action: () => Promise<unknown>, done: string): Promise<void> {
  try {
    await action();
    notify({ message: done, tone: 'positive' });
  } catch (error) {
    notify({ message: 'That didn’t work', error });
  }
}

interface KeyDraft {
  readonly key: string;
  readonly setKey: (key: string) => void;
  readonly error: string | null;
  readonly saving: boolean;
  readonly submit: () => Promise<void>;
}

function useKeyDraft({
  saved,
  save,
  onClose,
}: Pick<KeyPasteSheetProps, 'saved' | 'save'> & {
  readonly onClose: () => void;
}): KeyDraft {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await save(key.trim());
      notify({ message: saved, tone: 'positive' });
      setKey('');
      onClose();
    } catch (cause) {
      setError(errorText(cause).title);
    } finally {
      setSaving(false);
    }
  };
  return { key, setKey, error, saving, submit };
}

export function KeyPasteSheet({
  open,
  onClose,
  label,
  placeholder,
  helper,
  saved,
  valid,
  save,
}: KeyPasteSheetProps): ReactNode {
  const { key, setKey, error, saving, submit } = useKeyDraft({ saved, save, onClose });
  const ready = valid(key);
  const footer = (
    <Button
      label="Check and save"
      grow
      loading={saving}
      disabled={!ready}
      onPress={() => {
        background(submit(), 'key_paste_sheet.submit_failed');
      }}
    />
  );
  return (
    <Sheet open={open} onClose={onClose} title="Paste your key" detents={['fit']} footer={footer}>
      <View className="gap-3 pb-2">
        <TextField
          label={label}
          kind="password"
          value={key}
          onChange={setKey}
          {...(ready
            ? {
                onSubmit: (): void => {
                  background(submit(), 'key_paste_sheet.submit_failed');
                },
              }
            : {})}
          placeholder={placeholder}
          helper={helper}
          error={error}
          focusOnMount
        />
      </View>
    </Sheet>
  );
}
