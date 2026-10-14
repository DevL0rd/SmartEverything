import { useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import type { AiSubscriptionInteraction } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { DecisionOptions } from '../../../components/decision-options';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
function SignInWebsite({
  url,
  pending,
}: {
  readonly url: string | null;
  readonly pending: boolean;
}): ReactNode {
  const [failed, setFailed] = useState(false);
  if (url === null) return null;
  if (new URL(url).protocol !== 'https:' && new URL(url).protocol !== 'http:')
    return <Text tone="warning">The supplied sign-in URL cannot be opened safely.</Text>;
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        Sign-in page · {new URL(url).hostname}
      </Text>
      <Button
        label="Open sign-in page"
        size="lg"
        disabled={pending}
        onPress={() => {
          void Linking.openURL(url).catch(() => {
            setFailed(true);
          });
        }}
      />
      {failed ? <Text tone="critical">The sign-in page could not be opened.</Text> : null}
    </View>
  );
}
function needsAnswer(interaction: AiSubscriptionInteraction): boolean {
  return (
    interaction.prompt === 'select' ||
    interaction.prompt === 'manual_code' ||
    interaction.prompt === 'text'
  );
}
export function SubscriptionInteraction({
  interaction,
  pending,
  acknowledged = false,
  answer,
}: {
  readonly acknowledged?: boolean;
  readonly interaction: AiSubscriptionInteraction;
  readonly pending: boolean;
  readonly answer: (text: string) => Promise<void>;
}): ReactNode {
  const [value, setValue] = useState('');
  const frozen = pending || acknowledged;
  const send = (): void => {
    if (frozen) return;
    const submitted = value;
    setValue('');
    void answer(submitted);
  };
  return (
    <View className="gap-3">
      <Text>{interaction.message}</Text>
      <SignInWebsite url={interaction.url} pending={frozen} />
      {interaction.user_code === null ? null : (
        <Text variant="title-2" selectable className="rounded-md bg-surface-2 p-4 text-center">
          {interaction.user_code}
        </Text>
      )}
      <InteractionField
        interaction={interaction}
        pending={frozen}
        value={value}
        change={setValue}
      />
      {acknowledged ? (
        <Text tone="variant" accessibilityLiveRegion="polite">
          Answer received · waiting for sign-in to continue. Check status for the next step.
        </Text>
      ) : null}
      {!needsAnswer(interaction) ? null : (
        <Button
          label="Continue"
          size="lg"
          disabled={frozen || value.trim() === ''}
          onPress={send}
        />
      )}
    </View>
  );
}
function InteractionField({
  interaction,
  pending,
  value,
  change,
}: {
  readonly interaction: AiSubscriptionInteraction;
  readonly pending: boolean;
  readonly value: string;
  readonly change: (value: string) => void;
}): ReactNode {
  if (interaction.prompt === 'select')
    return (
      <DecisionOptions
        options={interaction.options}
        selected={value === '' ? [] : [value]}
        multi={false}
        disabled={pending}
        choose={change}
      />
    );
  if (interaction.prompt !== 'manual_code' && interaction.prompt !== 'text') return null;
  return (
    <TextField
      label={
        interaction.prompt === 'manual_code' ? 'Paste the sign-in response' : interaction.message
      }
      value={value}
      onChange={change}
      disabled={pending}
      kind="password"
    />
  );
}
