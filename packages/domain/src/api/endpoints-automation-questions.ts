import { z } from 'zod';
import { AUTOMATION_QUESTION, AUTOMATION_QUESTION_ANSWER } from '../automation-v3';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

const QUESTION_PARAMS = z.strictObject({ questionId: z.string().min(1) });

export const AUTOMATION_QUESTION_ENDPOINTS = {
  listAutomationQuestions: endpoint({
    method: 'GET',
    path: '/api/automation-questions',
    access: 'member',
    summary:
      'Questions automations are waiting on: yours, or everyone’s for the owner, oldest first, with the buttons you can press',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(AUTOMATION_QUESTION),
  }),
  answerAutomationQuestion: endpoint({
    method: 'POST',
    path: '/api/automation-questions/:questionId/answer',
    access: 'member',
    summary:
      'Press one of the buttons of a question an automation asked; the waiting run continues with that answer',
    params: QUESTION_PARAMS,
    query: NOTHING,
    body: AUTOMATION_QUESTION_ANSWER,
    response: AUTOMATION_QUESTION,
  }),
} as const;
