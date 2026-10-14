import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatProvider } from '@smarteverything/domain';
import { NativeElicitation } from '../../../components/native-elicitation';
import { DecisionStatus } from '../../../components/decision-frame';
import { useProviderAnswer } from './provider-data';
export function ElicitationForm({
  chatId,
  prompt,
  disabled = false,
}: {
  readonly chatId: string;
  readonly prompt: AiChatProvider['prompts'][number];
  readonly disabled?: boolean;
}): ReactNode {
  const answer = useProviderAnswer(chatId, prompt.id);
  return (
    <View className="gap-3">
      <NativeElicitation
        request={prompt.request}
        url={prompt.kind === 'elicitation_url'}
        pending={disabled || answer.isPending || answer.isSuccess}
        submit={(value) => {
          answer.mutate({ decision: 'elicitation', ...value });
        }}
      />
      <DecisionStatus pending={answer.isPending} received={answer.isSuccess} error={answer.error} />
    </View>
  );
}
