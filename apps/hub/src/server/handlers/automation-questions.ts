import { AUTOMATION_QUESTION_ENDPOINTS as E } from '@smarteverything/domain';
import type { QuestionDesk } from '../../automations/questions/desk';
import type { Store } from '../../store/store';
import { profileIdOf, roleOfCaller } from '../auth';
import { bound } from '../router';

export interface AutomationQuestionDeps {
  readonly store: Store;
  readonly questions: Pick<QuestionDesk, 'pending' | 'answer'>;
}

export const automationQuestionRoutes = (deps: AutomationQuestionDeps) =>
  ({
    listAutomationQuestions: bound(E.listAutomationQuestions, ({ caller }) =>
      deps.questions.pending(roleOfCaller(caller) === 'owner' ? null : profileIdOf(caller)),
    ),
    answerAutomationQuestion: bound(E.answerAutomationQuestion, ({ params, body, caller }) =>
      deps.questions.answer(
        params.questionId,
        { profileId: profileIdOf(caller), owner: roleOfCaller(caller) === 'owner' },
        body.answer,
      ),
    ),
  }) as const;
