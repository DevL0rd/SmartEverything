import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { OPENROUTER_KEY } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { errorText } from '../../../format/errors';
import { useIsOwner } from '../../../store/selectors';
import { useOpenRouterActions } from '../data/openrouter';

function OwnerKeyForm(): ReactNode {
  const { saveKey } = useOpenRouterActions();
  const [key, setKey] = useState('');
  const save = useMutation({
    mutationFn: (value: string) => saveKey(value.trim()),
    onSuccess: () => {
      notify({ message: 'OpenRouter key saved', tone: 'positive' });
    },
  });
  const ready = OPENROUTER_KEY.safeParse(key).success;
  const submit = (): void => {
    if (ready && !save.isPending) save.mutate(key);
  };
  return (
    <>
      <TextField
        label="OpenRouter key"
        kind="password"
        value={key}
        onChange={setKey}
        onSubmit={submit}
        placeholder="Paste key"
        error={save.isError ? errorText(save.error).title : null}
      />
      <Button label="Check and save" loading={save.isPending} disabled={!ready} onPress={submit} />
    </>
  );
}

export function DraftKeyCard({
  onChooseComputer,
}: {
  readonly onChooseComputer: () => void;
}): ReactNode {
  const owner = useIsOwner();
  return (
    <View className="w-full max-w-dialog">
      <Card icon="key" title="Add an OpenRouter key to start">
        <View className="gap-3">
          <Text variant="footnote" tone="variant">
            {owner
              ? 'Cloud models on Home Hub need a key. Paste it here and it stays on your hub.'
              : 'Ask the owner to add an OpenRouter key.'}
          </Text>
          {owner ? <OwnerKeyForm /> : null}
          <Button
            label="Or choose a model on a computer"
            variant="outlined"
            onPress={onChooseComputer}
          />
        </View>
      </Card>
    </View>
  );
}
