import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { TextField } from '../../../components/text-field';

export interface CredentialsFormProps {
  readonly onSubmit: (user: string, password: string) => Promise<string | null>;
  readonly initialUser?: string;
  readonly label?: string;
}

export function CredentialsForm({
  onSubmit,
  initialUser = '',
  label = 'Sign in and test',
}: CredentialsFormProps): ReactNode {
  const [user, setUser] = useState(initialUser);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = (): void => {
    setBusy(true);
    setProblem(null);
    background(
      onSubmit(user.trim(), password)
        .then((error) => {
          setProblem(error);
        })
        .finally(() => {
          setBusy(false);
        }),
      'printer.sign_in_failed',
    );
  };
  return (
    <View className="gap-3">
      <TextField label="User name" value={user} onChange={setUser} kind="text" />
      <TextField
        label="Password"
        value={password}
        onChange={setPassword}
        kind="password"
        error={problem}
        onSubmit={submit}
      />
      <Button
        label={label}
        icon="key"
        loading={busy}
        disabled={user.trim() === '' || password === ''}
        onPress={submit}
      />
    </View>
  );
}
