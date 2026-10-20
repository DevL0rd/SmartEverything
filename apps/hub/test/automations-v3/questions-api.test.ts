import { randomUUID } from 'node:crypto';
import { AUTOMATION_QUESTION_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuestionDesk } from '../../src/automations/questions/desk';
import { automationQuestionRoutes } from '../../src/server/handlers/automation-questions';
import { captureLogs, testLogger } from '../support/logs';
import { automationOf, logLine, programRig, type ProgramRig } from './support/program-rig';
import type { Caller } from '../../src/server/auth';

const NOW = new Date('2026-10-18T09:00:00.000Z');

let rig: ProgramRig;
let routes: ReturnType<typeof automationQuestionRoutes>;
let automationId: string;

beforeEach(() => {
  captureLogs();
  rig = programRig();
  const made = rig.service.create(rig.owner.caller, {
    name: 'Door',
    enabled: true,
    definition: automationOf([logLine('say', 'hi')]),
  });
  if (made.id === null) throw new Error(made.summary);
  automationId = made.id;
  const desk = new QuestionDesk({
    questions: rig.store.automationQuestions,
    clock: { now: (): Date => NOW },
  });
  routes = automationQuestionRoutes({ store: rig.store, questions: desk });
});

afterEach(() => {
  rig.close();
});

function ask(personId: string): string {
  const id = randomUUID();
  rig.store.automationQuestions.open({
    id,
    automationId,
    runId: randomUUID(),
    personId,
    question: 'Lock the door?',
    options: ['Yes', 'No'],
    deadlineAt: null,
  });
  return id;
}

async function call<R extends z.ZodType>(
  shape: { readonly response: R },
  caller: Caller,
  raw: { params?: unknown; body?: unknown } = {},
): Promise<z.output<R>> {
  const route = Object.values(routes).find((entry) => Object.is(entry.endpoint, shape));
  if (route === undefined) throw new Error('The endpoint is not bound.');
  const result = await route.run(
    caller,
    { params: {}, query: {}, body: undefined, remote: 'test', ...raw },
    testLogger(),
  );
  return shape.response.parse(result);
}

async function refused(work: Promise<unknown>): Promise<ApiError> {
  try {
    await work;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('The call was not refused.');
}

describe('automation questions over the API', () => {
  it('lists every open question for the owner and only their own for a member', async () => {
    const theirs = ask(rig.member.profileId);
    const mine = ask(rig.owner.profileId);
    const everyone = await call(E.listAutomationQuestions, rig.owner.caller);
    expect(everyone.map((question) => question.id).sort()).toEqual([mine, theirs].sort());
    const own = await call(E.listAutomationQuestions, rig.member.caller);
    expect(own.map((question) => question.id)).toEqual([theirs]);
    expect(own[0]).toMatchObject({
      automation_name: 'Door',
      options: ['Yes', 'No'],
      person_id: rig.member.profileId,
    });
  });

  it('records the answer of the person asked and stops listing the question', async () => {
    const id = ask(rig.member.profileId);
    const reply = await call(E.answerAutomationQuestion, rig.member.caller, {
      params: { questionId: id },
      body: { answer: 'Yes' },
    });
    expect(reply).toMatchObject({
      state: 'answered',
      answer: 'Yes',
      answered_by: rig.member.profileId,
    });
    expect(await call(E.listAutomationQuestions, rig.owner.caller)).toEqual([]);
  });

  it('lets the owner answer for someone else', async () => {
    const id = ask(rig.member.profileId);
    const reply = await call(E.answerAutomationQuestion, rig.owner.caller, {
      params: { questionId: id },
      body: { answer: 'No' },
    });
    expect(reply).toMatchObject({ state: 'answered', answered_by: rig.owner.profileId });
  });

  it('hides a question from a member who was not asked and refuses a wrong button', async () => {
    const owners = ask(rig.owner.profileId);
    const hidden = await refused(
      call(E.answerAutomationQuestion, rig.member.caller, {
        params: { questionId: owners },
        body: { answer: 'Yes' },
      }),
    );
    expect(hidden.code).toBe('not_found');
    const mine = ask(rig.member.profileId);
    const wrong = await refused(
      call(E.answerAutomationQuestion, rig.member.caller, {
        params: { questionId: mine },
        body: { answer: 'Maybe' },
      }),
    );
    expect(wrong.code).toBe('invalid_request');
    const twice = ask(rig.member.profileId);
    await call(E.answerAutomationQuestion, rig.member.caller, {
      params: { questionId: twice },
      body: { answer: 'Yes' },
    });
    const again = await refused(
      call(E.answerAutomationQuestion, rig.member.caller, {
        params: { questionId: twice },
        body: { answer: 'No' },
      }),
    );
    expect(again.code).toBe('conflict');
  });
});
