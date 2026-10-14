import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { CLAUDE_PROMPT, type AiChatProvider, type ClaudePrompt } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ActionDetails } from '../../../components/action-details';
import { DecisionStatus } from '../../../components/decision-frame';
import { ElicitationForm } from './elicitation-form';
import { Text } from '../../../components/text';
import { PromptQuestions, type QuestionAnswer } from '../../computers/components/prompt-questions';
import { useProviderAnswer } from './provider-data';
type Prompt = AiChatProvider['prompts'][number];
function Details({ prompt }: { readonly prompt: ClaudePrompt }): ReactNode {
  return (
    <View className="gap-3">
      {prompt.kind === 'question' ? null : (
        <>
          <Text variant="title-3" accessibilityRole="header">
            {prompt.kind === 'plan' ? 'Review the plan' : `Allow ${prompt.tool_name}?`}
          </Text>
          <ActionDetails value={prompt.input} />
        </>
      )}
      {prompt.risk_reasons.map((reason) => (
        <Text key={reason} tone="warning">
          {reason}
        </Text>
      ))}
      <Text variant="caption" tone="variant">
        Expires {new Date(prompt.expires_at).toLocaleTimeString()}
      </Text>
    </View>
  );
}
function questionAnswers(answers: readonly QuestionAnswer[]): Record<string, string> {
  return Object.fromEntries(answers.map((item) => [item.question, item.choices.join(', ')]));
}
function NativePrompt({
  chatId,
  prompt,
  disabled,
}: {
  readonly chatId: string;
  readonly prompt: Prompt;
  readonly disabled: boolean;
}): ReactNode {
  const parsed = CLAUDE_PROMPT.safeParse(prompt.request);
  const answer = useProviderAnswer(chatId, prompt.id);
  const frozen = disabled || answer.isPending || answer.isSuccess;
  if (!parsed.success)
    return (
      <View className="gap-3">
        <Text tone="warning">Unsupported native request. Answer on the supplying computer.</Text>
        <Button
          label="Cancel request"
          disabled={frozen}
          onPress={() => {
            answer.mutate({ decision: 'cancel' });
          }}
        />
        <DecisionStatus
          pending={answer.isPending}
          received={answer.isSuccess}
          error={answer.error}
        />
      </View>
    );
  return <ParsedPrompt prompt={parsed.data} frozen={frozen} answer={answer} />;
}
function ParsedPrompt({
  prompt,
  frozen,
  answer,
}: {
  readonly prompt: ClaudePrompt;
  readonly frozen: boolean;
  readonly answer: ReturnType<typeof useProviderAnswer>;
}): ReactNode {
  const expired = useExpired(prompt.expires_at);
  const stale = prompt.state !== 'waiting' || expired;
  const blocked = frozen || stale;
  return (
    <View className="gap-3">
      <Details prompt={prompt} />
      {stale ? (
        <Text tone="warning">This request expired or was answered on the computer.</Text>
      ) : null}
      {prompt.kind === 'question' ? (
        <PromptQuestions
          custom
          questions={prompt.questions}
          pending={blocked}
          submit={(answers) => {
            answer.mutate({ decision: 'question', answers: questionAnswers(answers) });
          }}
        />
      ) : (
        <Button
          label="Allow once"
          size="lg"
          disabled={blocked}
          onPress={() => {
            answer.mutate({ decision: 'allow' });
          }}
        />
      )}
      <RejectActions answer={answer} blocked={blocked} />
      <DecisionStatus pending={answer.isPending} received={answer.isSuccess} error={answer.error} />
    </View>
  );
}
export function ProviderPrompt({
  chatId,
  prompt,
  disabled = false,
}: {
  readonly chatId: string;
  readonly prompt: Prompt;
  readonly disabled?: boolean;
}): ReactNode {
  if (prompt.status !== 'pending') return null;
  if (prompt.kind === 'elicitation_form' || prompt.kind === 'elicitation_url')
    return <ElicitationForm chatId={chatId} prompt={prompt} disabled={disabled} />;
  return <NativePrompt chatId={chatId} prompt={prompt} disabled={disabled} />;
}

function RejectActions({
  answer,
  blocked,
}: {
  readonly answer: ReturnType<typeof useProviderAnswer>;
  readonly blocked: boolean;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Deny"
        size="lg"
        variant="outlined"
        disabled={blocked}
        onPress={() => {
          answer.mutate({ decision: 'deny' });
        }}
      />
      <Button
        label="Cancel request"
        size="lg"
        variant="text"
        disabled={blocked}
        onPress={() => {
          answer.mutate({ decision: 'cancel' });
        }}
      />
    </View>
  );
}
function useExpired(expires: string): boolean {
  const [expired, setExpired] = useState(() => Date.parse(expires) <= Date.now());
  useEffect(() => {
    const timer = setTimeout(
      () => {
        setExpired(true);
      },
      Math.max(0, Date.parse(expires) - Date.now()),
    );
    return (): void => {
      clearTimeout(timer);
    };
  }, [expires]);
  return expired;
}
