import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CodexPrompt } from '@smarteverything/domain';
import { DecisionStatus } from '../../../components/decision-frame';
import { CodexPromptCard } from '../../computers';
import { useCodexAnswer } from './codex-provider-data';
export function CodexProviderPrompt({
  chatId,
  prompt,
  disabled = false,
}: {
  readonly chatId: string;
  readonly prompt: CodexPrompt;
  readonly disabled?: boolean;
}): ReactNode {
  const answer = useCodexAnswer(chatId, prompt.id);
  return (
    <View className="gap-3">
      <CodexPromptCard
        prompt={prompt}
        pending={disabled || answer.isPending || answer.isSuccess}
        answer={answer.mutate}
      />
      <DecisionStatus pending={answer.isPending} received={answer.isSuccess} error={answer.error} />
    </View>
  );
}
