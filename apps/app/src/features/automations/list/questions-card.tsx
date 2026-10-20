import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useAnswerQuestion, useQuestions } from '../data/use-questions';
import { questionLines, questionsTitle, type QuestionLine } from './questions-model';

function QuestionRow({
  line,
  busy,
  onAnswer,
}: {
  readonly line: QuestionLine;
  readonly busy: boolean;
  readonly onAnswer: (answer: string) => void;
}): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        {line.deadline === null ? line.automation : `${line.automation} · ${line.deadline}`}
      </Text>
      <Text variant="body">{line.question}</Text>
      <View className="flex-row flex-wrap gap-2">
        {line.options.map((option) => (
          <Button
            key={option}
            label={option}
            variant="tonal"
            disabled={busy}
            onPress={() => {
              onAnswer(option);
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function QuestionsCard({ timeZone }: { readonly timeZone: string | null }): ReactNode {
  const questions = useQuestions();
  const answer = useAnswerQuestion();
  const [busy, setBusy] = useState<string | null>(null);
  const lines = questionLines(questions.data ?? [], timeZone);
  if (lines.length === 0) return null;
  const send = async (id: string, text: string): Promise<void> => {
    setBusy(id);
    try {
      await answer(id, text);
    } catch (error) {
      notify({ message: 'The answer wasn’t sent', tone: 'critical', error });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card title={questionsTitle(lines.length)} icon="messageCircle" tone="attention">
      {lines.map((line) => (
        <QuestionRow
          key={line.id}
          line={line}
          busy={busy === line.id}
          onAnswer={(text) => {
            background(send(line.id, text), 'automations.answer_question');
          }}
        />
      ))}
    </Card>
  );
}
