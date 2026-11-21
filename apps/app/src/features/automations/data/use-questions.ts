import { useEffect } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import type { AutomationQuestion } from '@smarteverything/domain';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { automationKeys } from './keys';
import { useAutomationsSource } from './source';

export function useQuestions(): UseQueryResult<AutomationQuestion[]> {
  const { api, runWaitChanges } = useAutomationsSource();
  const client = useQueryClient();
  useEffect(
    () =>
      runWaitChanges(() => {
        background(
          client.invalidateQueries(
            { queryKey: automationKeys.questions() },
            { cancelRefetch: false },
          ),
          'automations.questions_refresh',
        );
      }),
    [client, runWaitChanges],
  );
  return useScreenQuery({
    queryKey: automationKeys.questions(),
    queryFn: ({ signal }) => api.listQuestions(signal),
  });
}

export function useAnswerQuestion(): (questionId: string, answer: string) => Promise<void> {
  const { api } = useAutomationsSource();
  const client = useQueryClient();
  return async (questionId, answer) => {
    await api.answerQuestion(questionId, answer);
    await client.invalidateQueries({ queryKey: automationKeys.questions() });
  };
}
