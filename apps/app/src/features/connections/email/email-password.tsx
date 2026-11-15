import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import type { EmailDraft } from './email-model';

export interface EmailPasswordProps {
  readonly draft: EmailDraft;
  readonly onChange: (edit: Partial<EmailDraft>) => void;
}

function SavedPassword({
  draft,
  onChange,
  onReplace,
}: EmailPasswordProps & { readonly onReplace: () => void }): ReactNode {
  if (draft.clearPassword) {
    return (
      <View className="min-h-touch-min flex-row flex-wrap items-center justify-between gap-2">
        <Text variant="callout" tone="variant" className="min-w-0 shrink">
          The saved password is removed when you save.
        </Text>
        <Button
          label="Keep it"
          variant="text"
          onPress={() => {
            onChange({ clearPassword: false });
          }}
        />
      </View>
    );
  }
  return (
    <View className="min-h-touch-min flex-row flex-wrap items-center justify-between gap-2">
      <Text variant="callout" className="min-w-0 shrink">
        Password saved on the hub
      </Text>
      <View className="flex-row gap-1">
        <Button label="Change" variant="tonal" onPress={onReplace} />
        <Button
          label="Remove"
          variant="text"
          onPress={() => {
            onChange({ clearPassword: true, password: '' });
          }}
        />
      </View>
    </View>
  );
}

export function EmailPassword({ draft, onChange }: EmailPasswordProps): ReactNode {
  const [replacing, setReplacing] = useState(false);
  if (draft.user.trim() === '') return null;
  if (draft.passwordSet && !replacing && draft.password === '') {
    return (
      <SavedPassword
        draft={draft}
        onChange={onChange}
        onReplace={() => {
          setReplacing(true);
        }}
      />
    );
  }
  return (
    <TextField
      label={draft.passwordSet ? 'New password' : 'Password'}
      kind="password"
      value={draft.password}
      helper="Kept in the hub's secret store and never shown again."
      focusOnMount={replacing}
      onChange={(password) => {
        onChange({ password, clearPassword: false });
      }}
    />
  );
}
