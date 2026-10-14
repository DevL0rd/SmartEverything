import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CodexPrompt, CodexAnswer } from '@smarteverything/domain';
import { ActionDetails } from '../../../components/action-details';
import { DecisionApproval } from '../../../components/decision-approval';
import { codexChoices } from '../../../components/decision-choices';
import { DecisionQuestions } from '../../../components/decision-questions';
import { Text } from '../../../components/text';
import { NativeElicitation } from '../../../components/native-elicitation';
interface Props {
  readonly prompt: CodexPrompt;
  readonly pending: boolean;
  readonly answer: (answer: CodexAnswer) => void;
}
function Questions({
  prompt,
  pending,
  answer,
}: Props & { readonly prompt: Extract<CodexPrompt, { kind: 'user_input' }> }): ReactNode {
  return (
    <DecisionQuestions
      pending={pending}
      questions={prompt.questions.map((question) => ({
        id: question.id,
        title: question.question,
        header: question.header,
        options:
          question.options === null
            ? []
            : question.options.map((option) => ({ id: option.label, ...option })),
        multi: false,
        custom: question.is_other || question.options === null,
        secret: question.is_secret,
      }))}
      submit={(answers) => {
        answer({
          kind: 'user_input',
          answers: Object.fromEntries(
            answers.map((item) => [
              item.id,
              item.custom.trim() === '' ? [...item.selected] : [item.custom],
            ]),
          ),
        });
      }}
    />
  );
}
function PromptAnswer({ prompt, pending, answer }: Props): ReactNode {
  if (prompt.kind === 'user_input')
    return <Questions prompt={prompt} pending={pending} answer={answer} />;
  if (prompt.kind === 'mcp_form' || prompt.kind === 'mcp_url')
    return (
      <NativeElicitation
        request={
          prompt.kind === 'mcp_url'
            ? { message: prompt.title, url: prompt.url }
            : { message: prompt.title, requestedSchema: prompt.schema }
        }
        url={prompt.kind === 'mcp_url'}
        pending={pending}
        submit={(value) => {
          answer({ kind: 'elicitation', ...value });
        }}
      />
    );
  if (prompt.kind === 'unsupported')
    return (
      <Text tone="warning">
        {prompt.reason} Answer on the supplying computer or interrupt the owning turn.
      </Text>
    );
  return (
    <DecisionApproval
      options={codexChoices(prompt)}
      pending={pending}
      answer={(id) => {
        answer({ kind: 'approval', choice_id: id });
      }}
    />
  );
}
export function CodexPromptCard(props: Props): ReactNode {
  if (props.prompt.status !== 'pending') return null;
  return (
    <View className="gap-3">
      {props.prompt.kind === 'user_input' ? null : (
        <>
          <Text variant="title-3" accessibilityRole="header">
            {props.prompt.title}
          </Text>
          <ActionDetails title="Requested scope" value={props.prompt.payload} />
        </>
      )}
      <PromptAnswer {...props} />
    </View>
  );
}
