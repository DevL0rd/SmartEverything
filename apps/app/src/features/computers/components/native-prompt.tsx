import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ClaudePrompt } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { StructuredValue } from '../../../components/structured-value';
import { Text } from '../../../components/text';
import { useNativeAnswer } from '../data/native-session';
import { PromptQuestions } from './prompt-questions';

const TITLES = {
  question: 'Claude has a question',
  plan: 'Review Claude’s plan',
  permission: 'Claude requests permission',
} as const;

function PromptDetails({ prompt }: { readonly prompt: ClaudePrompt }): ReactNode {
  return (
    <>
      <Text variant="title-3">{TITLES[prompt.kind]}</Text>
      <Text tone="variant">
        {prompt.tool_name} · {prompt.state}
      </Text>
      <StructuredValue title="Requested action" value={prompt.input} />
      {prompt.risk_reasons.map((reason) => (
        <Text key={reason} tone="warning">
          {reason}
        </Text>
      ))}
      <Text variant="footnote" tone="variant">
        Expires {new Date(prompt.expires_at).toLocaleTimeString()}
      </Text>
    </>
  );
}

export function NativePrompt({
  deviceId,
  prompt,
}: {
  readonly deviceId: string;
  readonly prompt: ClaudePrompt;
}): ReactNode {
  const action = useNativeAnswer(deviceId, prompt.id);
  return (
    <View className="gap-3 rounded-lg border border-outline bg-surface-2 p-4">
      <PromptDetails prompt={prompt} />
      {prompt.state !== 'waiting' ? null : (
        <>
          <Button
            label="Deny"
            variant="tonal"
            loading={action.isPending}
            onPress={() => {
              action.mutate({ decision: 'deny' });
            }}
          />
          {prompt.kind === 'question' ? (
            <PromptQuestions
              questions={prompt.questions}
              pending={action.isPending}
              submit={(answers) => {
                action.mutate({
                  decision: 'answer',
                  answers: answers.map((answer) => ({ ...answer, choices: [...answer.choices] })),
                });
              }}
            />
          ) : (
            <Button
              label="Allow"
              loading={action.isPending}
              onPress={() => {
                action.mutate({ decision: 'allow' });
              }}
            />
          )}
        </>
      )}
    </View>
  );
}
