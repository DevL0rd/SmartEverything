import { API_ENDPOINTS as E, type AppViewResult } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '../../src/server/auth';
import type { AppViewOutcome } from '../../src/app-view/broker';
import type { AppViewDesk } from '../../src/app-view/show';
import { appViewRoutes } from '../../src/server/handlers/app-view';
import { captureLogs, testLogger } from '../support/logs';
import { addPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

interface Answered {
  readonly clientId: string;
  readonly requestId: string;
  readonly result: AppViewResult;
}

let answered: Answered[];

function deskOf(test: TestStore, foreground: ReadonlySet<string> = new Set()): AppViewDesk {
  return {
    broker: {
      ask: (): Promise<AppViewOutcome> => Promise.resolve({ kind: 'unanswered' }),
      answer: (clientId, requestId, result): void => {
        answered.push({ clientId, requestId, result });
      },
    },
    store: test.store,
    foreground: () => foreground,
  };
}

beforeEach(() => {
  captureLogs();
  answered = [];
});

describe('the app view answer route', () => {
  it('hands the answer to the broker under the calling app', async () => {
    const test = await testStore();
    const dana = addPerson(test, 'Dana', 'member');
    const routes = appViewRoutes(deskOf(test));
    const caller: Caller = { kind: 'client', client: dana.client };
    const result: AppViewResult = { ok: false, reason: 'app_not_in_front' };
    const reply = await routes.answerAppView.run(
      caller,
      { params: {}, query: {}, body: { requestId: REQUEST_ID, result }, remote: 'test' },
      testLogger(),
    );
    expect(reply).toEqual({ ok: true });
    expect(answered).toEqual([{ clientId: dana.client.id, requestId: REQUEST_ID, result }]);
    expect(E.answerAppView.access).toBe('member');
    await test.close();
  });

  it('refuses an answer that does not match the contract', async () => {
    const test = await testStore();
    const dana = addPerson(test, 'Dana', 'member');
    const routes = appViewRoutes(deskOf(test));
    await expect(
      routes.answerAppView.run(
        { kind: 'client', client: dana.client },
        { params: {}, query: {}, body: { requestId: REQUEST_ID, result: {} }, remote: 'test' },
        testLogger(),
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(answered).toEqual([]);
    await test.close();
  });
});

describe('the show in app route', () => {
  it('asks the calling app and returns what it showed', async () => {
    const test = await testStore();
    const dana = addPerson(test, 'Dana', 'member');
    const desk = deskOf(test, new Set([dana.client.id]));
    const routes = appViewRoutes({
      ...desk,
      broker: {
        ...desk.broker,
        ask: () =>
          Promise.resolve({
            kind: 'answered',
            result: { ok: true, opened: 'Fitness', highlighted: false, reason: null },
          }),
      },
    });
    const reply = await routes.showInApp.run(
      { kind: 'client', client: dana.client },
      {
        params: {},
        query: {},
        body: { action: 'open', target: { kind: 'section', section: 'fitness' } },
        remote: 'test',
      },
      testLogger(),
    );
    expect(reply).toEqual({
      ok: true,
      app: 'Dana phone',
      opened: 'Fitness',
      highlighted: false,
      reason: null,
    });
    expect(E.showInApp.access).toBe('member');
    await test.close();
  });

  it('refuses a request that does not match the contract', async () => {
    const test = await testStore();
    const dana = addPerson(test, 'Dana', 'member');
    const routes = appViewRoutes(deskOf(test));
    await expect(
      routes.showInApp.run(
        { kind: 'client', client: dana.client },
        { params: {}, query: {}, body: { action: 'close' }, remote: 'test' },
        testLogger(),
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await test.close();
  });
});
