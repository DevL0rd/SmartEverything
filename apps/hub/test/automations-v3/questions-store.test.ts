import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sweepAutomationRetention } from '../../src/store/retention-automations';
import { Sql } from '../../src/store/sql';
import { captureLogs } from '../support/logs';
import { automationOf, logLine, programRig, type ProgramRig } from './support/program-rig';

let rig: ProgramRig;
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
});

afterEach(() => {
  rig.close();
});

function ask(
  personId: string,
  runId: string = randomUUID(),
  deadlineAt: string | null = null,
): string {
  const id = randomUUID();
  rig.store.automationQuestions.open({
    id,
    automationId,
    runId,
    personId,
    question: 'Lock the door?',
    options: ['Yes', 'No'],
    deadlineAt,
  });
  return id;
}

function count(): number {
  const row = rig.database.prepare('select count(*) as n from automation_questions').get();
  return Number(row?.['n']);
}

describe('the automation questions table', () => {
  it('opens a question once even when the same request is repeated', () => {
    const id = randomUUID();
    const write = {
      id,
      automationId,
      runId: randomUUID(),
      personId: rig.owner.profileId,
      question: 'Lock the door?',
      options: ['Yes', 'No'],
      deadlineAt: null,
    };
    const first = rig.store.automationQuestions.open(write);
    const again = rig.store.automationQuestions.open({ ...write, question: 'Something else?' });
    expect(again).toEqual(first);
    expect(count()).toBe(1);
  });

  it('takes one answer only', () => {
    const id = ask(rig.owner.profileId);
    const write = { id, answer: 'Yes', answeredBy: rig.owner.profileId };
    expect(rig.store.automationQuestions.answer(write)).toBe(true);
    expect(rig.store.automationQuestions.answer({ ...write, answer: 'No' })).toBe(false);
    expect(rig.store.automationQuestions.byId(id)).toMatchObject({
      state: 'answered',
      answer: 'Yes',
    });
  });

  it('lists only the open questions of a person whose time has not run out', () => {
    const now = '2026-10-19T10:00:00.000Z';
    const open = ask(rig.owner.profileId, randomUUID(), '2026-10-19T11:00:00.000Z');
    ask(rig.owner.profileId, randomUUID(), '2026-10-19T09:00:00.000Z');
    ask(rig.member.profileId);
    const answered = ask(rig.owner.profileId);
    rig.store.automationQuestions.answer({
      id: answered,
      answer: 'No',
      answeredBy: rig.owner.profileId,
    });
    const mine = rig.store.automationQuestions.openFor(rig.owner.profileId, now);
    expect(mine.map((question) => question.id)).toEqual([open]);
    expect(rig.store.automationQuestions.openFor(null, now)).toHaveLength(2);
  });

  it('closes the open questions of a finished run and no others', () => {
    const run = randomUUID();
    const mine = ask(rig.owner.profileId, run);
    const other = ask(rig.owner.profileId);
    expect(rig.store.automationQuestions.closeRun(run)).toBe(1);
    expect(rig.store.automationQuestions.byId(mine).state).toBe('closed');
    expect(rig.store.automationQuestions.byId(other).state).toBe('open');
  });

  it('forgets the questions of a removed automation and of a removed person', () => {
    ask(rig.owner.profileId);
    ask(rig.member.profileId);
    rig.database.prepare('delete from profiles where id = ?').run(rig.member.profileId);
    expect(count()).toBe(1);
    rig.database.prepare('delete from automations where id = ?').run(automationId);
    expect(count()).toBe(0);
  });

  it('sweeps old settled questions and keeps open and recent ones', () => {
    const old = ask(rig.owner.profileId);
    const waiting = ask(rig.owner.profileId);
    const recent = ask(rig.owner.profileId);
    rig.store.automationQuestions.answer({
      id: old,
      answer: 'Yes',
      answeredBy: rig.owner.profileId,
    });
    rig.store.automationQuestions.answer({
      id: recent,
      answer: 'No',
      answeredBy: rig.owner.profileId,
    });
    const longAgo = '2020-01-01T00:00:00.000Z';
    rig.database
      .prepare('update automation_questions set created_at = ? where id in (?, ?)')
      .run(longAgo, old, waiting);
    const swept = sweepAutomationRetention(new Sql(rig.database), new Date());
    expect(swept['automation_questions']).toBe(1);
    expect(rig.store.automationQuestions.find(old)).toBeUndefined();
    expect(rig.store.automationQuestions.find(waiting)).toBeDefined();
    expect(rig.store.automationQuestions.find(recent)).toBeDefined();
  });
});
