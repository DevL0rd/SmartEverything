import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from './button';
import { DecisionOptions, type DecisionOption } from './decision-options';
import { Text } from './text';
import { useDecisionStepFocus } from './decision-keyboard';
import { TextField } from './text-field';

export interface DecisionQuestion {
  readonly id: string;
  readonly title: string;
  readonly header?: string;
  readonly detail?: string;
  readonly options: readonly DecisionOption[];
  readonly multi: boolean;
  readonly custom: boolean;
  readonly secret: boolean;
}
export interface DecisionAnswer {
  readonly id: string;
  readonly selected: readonly string[];
  readonly custom: string;
}
interface Draft extends DecisionAnswer {
  readonly other: boolean;
}
function emptyAnswer(question: DecisionQuestion): Draft {
  return { id: question.id, selected: [], custom: '', other: question.options.length === 0 };
}
function choose(question: DecisionQuestion, value: Draft, id: string): Draft {
  return {
    ...value,
    selected: question.multi
      ? value.selected.includes(id)
        ? value.selected.filter((item) => item !== id)
        : [...value.selected, id]
      : [id],
    custom: question.multi ? value.custom : '',
    other: question.multi ? value.other : false,
  };
}
function valid(value: Draft, question: DecisionQuestion): boolean {
  const count = value.selected.length + (value.custom.trim() === '' ? 0 : 1);
  return (
    count > 0 && (question.multi || count === 1) && (!value.other || value.custom.trim() !== '')
  );
}
function QuestionFields({
  question,
  value,
  disabled,
  change,
}: {
  readonly question: DecisionQuestion;
  readonly value: Draft;
  readonly disabled: boolean;
  readonly change: (value: Draft) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      {question.header === undefined ? null : (
        <Text variant="caption" tone="variant">
          {question.header}
        </Text>
      )}
      <Text variant="title-3" accessibilityRole="header">
        {question.title}
      </Text>
      {question.detail === undefined ? null : <Text selectable>{question.detail}</Text>}
      {question.multi ? (
        <Text variant="footnote" tone="variant">
          Choose any that apply
        </Text>
      ) : null}
      <QuestionOptions question={question} value={value} disabled={disabled} change={change} />
      <CustomField question={question} value={value} disabled={disabled} change={change} />
    </View>
  );
}

function QuestionOptions({
  question,
  value,
  disabled,
  change,
}: {
  readonly question: DecisionQuestion;
  readonly value: Draft;
  readonly disabled: boolean;
  readonly change: (value: Draft) => void;
}): ReactNode {
  if (question.options.length === 0) return null;
  const options = question.options.map((option) => ({ ...option, id: `option:${option.id}` }));
  if (question.custom) options.push({ id: 'custom', label: 'Other answer' });
  return (
    <DecisionOptions
      options={options}
      selected={[...value.selected.map((id) => `option:${id}`), ...(value.other ? ['custom'] : [])]}
      multi={question.multi}
      disabled={disabled}
      choose={(id) => {
        change(
          id === 'custom'
            ? {
                ...value,
                other: !value.other,
                custom: '',
                selected: question.multi ? value.selected : [],
              }
            : choose(question, value, id.slice('option:'.length)),
        );
      }}
    />
  );
}
function CustomField({
  question,
  value,
  disabled,
  change,
}: {
  readonly question: DecisionQuestion;
  readonly value: Draft;
  readonly disabled: boolean;
  readonly change: (value: Draft) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      {!question.custom || !value.other ? null : (
        <TextField
          label={question.options.length === 0 ? 'Your answer' : 'Other answer'}
          kind={question.secret ? 'password' : 'text'}
          value={value.custom}
          disabled={disabled}
          onChange={(custom) => {
            change({ ...value, custom });
          }}
        />
      )}
    </View>
  );
}
export function DecisionQuestions({
  questions,
  pending,
  submit,
}: {
  readonly questions: readonly DecisionQuestion[];
  readonly pending: boolean;
  readonly submit: (answers: readonly DecisionAnswer[]) => void;
}): ReactNode {
  const [step, setStep] = useState(0);
  const headingId = useDecisionStepFocus(step);
  const [values, setValues] = useState<readonly Draft[]>(questions.map(emptyAnswer));
  const question = questions[step];
  const value = question === undefined ? undefined : values.find((item) => item.id === question.id);
  if (question === undefined || value === undefined)
    return <Text tone="warning">Question identity changed. Reopen this request.</Text>;
  return (
    <View nativeID={headingId} className="gap-3">
      {questions.length <= 1 ? null : (
        <Text variant="caption" tone="variant">
          Question {step + 1} of {questions.length}
        </Text>
      )}
      <QuestionFields
        question={question}
        value={value}
        disabled={pending}
        change={(next) => {
          setValues(values.map((item) => (item.id === next.id ? next : item)));
        }}
      />
      <QuestionActions
        questions={questions}
        values={values}
        question={question}
        value={value}
        pending={pending}
        step={step}
        change={setStep}
        submit={submit}
      />
    </View>
  );
}

interface QuestionActionsProps {
  readonly questions: readonly DecisionQuestion[];
  readonly values: readonly Draft[];
  readonly question: DecisionQuestion;
  readonly value: Draft;
  readonly pending: boolean;
  readonly step: number;
  readonly change: (step: number) => void;
  readonly submit: (answers: readonly DecisionAnswer[]) => void;
}
function QuestionActions({
  questions,
  values,
  question,
  value,
  pending,
  step,
  change,
  submit,
}: QuestionActionsProps): ReactNode {
  const last = step === questions.length - 1;
  return (
    <View className="flex-row flex-wrap justify-end gap-2">
      {step === 0 ? null : (
        <Button
          label="Back"
          size="lg"
          variant="outlined"
          disabled={pending}
          onPress={() => {
            change(step - 1);
          }}
        />
      )}
      <Button
        label={last ? 'Send answers' : 'Next'}
        size="lg"
        disabled={
          pending ||
          (last
            ? !questions.every((item) => {
                const draft = values.find((entry) => entry.id === item.id);
                return draft !== undefined && valid(draft, item);
              })
            : !valid(value, question))
        }
        onPress={() => {
          if (last) submit(values.map(({ id, selected, custom }) => ({ id, selected, custom })));
          else change(step + 1);
        }}
      />
    </View>
  );
}
