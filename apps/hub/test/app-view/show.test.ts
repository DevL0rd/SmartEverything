import { createClientToken, hashClientToken, type AppViewResult } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppViewAsk, AppViewOutcome } from '../../src/app-view/broker';
import { showInApp, type AppViewDesk } from '../../src/app-view/show';
import type { Caller } from '../../src/server/auth';
import { captureLogs } from '../support/logs';
import { addPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const OPEN_FITNESS = { action: 'open', target: { kind: 'section', section: 'fitness' } } as const;
const OPENED: AppViewResult = { ok: true, opened: 'Fitness', highlighted: false, reason: null };

interface Asked {
  readonly clientId: string;
  readonly ask: AppViewAsk;
}

let test: TestStore;
let asked: Asked[];
let outcome: AppViewOutcome;
let foreground: Set<string>;

function desk(): AppViewDesk {
  return {
    broker: {
      ask: (clientId, ask): Promise<AppViewOutcome> => {
        asked.push({ clientId, ask });
        return Promise.resolve(outcome);
      },
      answer: (): void => undefined,
    },
    store: test.store,
    foreground: () => foreground,
  };
}

function asClient(client: { id: string }): Caller {
  return { kind: 'client', client: test.store.clients.byId(client.id) };
}

function secondApp(name: string, profileId: string): { id: string } {
  return test.store.clients.create({
    name,
    platform: 'web',
    role: 'member',
    tokenHash: hashClientToken(createClientToken()),
    profileId,
  });
}

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  asked = [];
  outcome = { kind: 'answered', result: OPENED };
  foreground = new Set();
});

afterEach(async () => {
  await test.close();
});

describe('choosing which app shows something', () => {
  it('asks the app the conversation runs in when it is open in front', async () => {
    const dana = addPerson(test, 'Dana', 'member');
    const tablet = secondApp('Dana tablet', dana.profileId);
    foreground = new Set([dana.client.id, tablet.id]);
    const result = await showInApp(desk(), asClient(dana.client), OPEN_FITNESS);
    expect(asked).toEqual([
      {
        clientId: dana.client.id,
        ask: { action: 'open', target: OPEN_FITNESS.target, focus: null },
      },
    ]);
    expect(result).toEqual({
      ok: true,
      app: 'Dana phone',
      opened: 'Fitness',
      highlighted: false,
      reason: null,
    });
  });

  it('falls back to the person’s only open app when the calling app is not open', async () => {
    const dana = addPerson(test, 'Dana', 'member');
    const tablet = secondApp('Dana tablet', dana.profileId);
    foreground = new Set([tablet.id]);
    await showInApp(desk(), asClient(dana.client), OPEN_FITNESS);
    expect(asked.map((entry) => entry.clientId)).toEqual([tablet.id]);
  });

  it('never picks an app of another person', async () => {
    const dana = addPerson(test, 'Dana', 'member');
    const sam = addPerson(test, 'Sam', 'member');
    foreground = new Set([sam.client.id]);
    const failure = showInApp(desk(), asClient(dana.client), OPEN_FITNESS);
    await expect(failure).rejects.toMatchObject({ code: 'conflict' });
    await expect(failure).rejects.toThrow('None of this person');
    expect(asked).toEqual([]);
  });

  it('lists the open apps with their ids when none is the calling one and several are open', async () => {
    const owner = addPerson(test, 'Olli', 'owner');
    const laptop = secondApp('Olli laptop', owner.profileId);
    const tablet = secondApp('Olli tablet', owner.profileId);
    foreground = new Set([laptop.id, tablet.id]);
    const failure = showInApp(desk(), asClient(owner.client), OPEN_FITNESS);
    await expect(failure).rejects.toMatchObject({ code: 'conflict' });
    await expect(failure).rejects.toThrow(`Olli laptop (${laptop.id})`);
    await expect(failure).rejects.toThrow(`Olli tablet (${tablet.id})`);
    expect(asked).toEqual([]);
  });

  it('lets an owner name any paired app and refuses a member naming another person’s', async () => {
    const owner = addPerson(test, 'Olli', 'owner');
    const dana = addPerson(test, 'Dana', 'member');
    const sam = addPerson(test, 'Sam', 'member');
    await showInApp(desk(), asClient(owner.client), { ...OPEN_FITNESS, appId: dana.client.id });
    expect(asked.map((entry) => entry.clientId)).toEqual([dana.client.id]);
    await expect(
      showInApp(desk(), asClient(dana.client), { ...OPEN_FITNESS, appId: sam.client.id }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(asked).toHaveLength(1);
  });

  it('lets a member name one of their own apps that is not open in front', async () => {
    const dana = addPerson(test, 'Dana', 'member');
    const tablet = secondApp('Dana tablet', dana.profileId);
    await showInApp(desk(), asClient(dana.client), { ...OPEN_FITNESS, appId: tablet.id });
    expect(asked.map((entry) => entry.clientId)).toEqual([tablet.id]);
  });

  it('refuses an app id that no paired app has', async () => {
    const owner = addPerson(test, 'Olli', 'owner');
    await expect(
      showInApp(desk(), asClient(owner.client), {
        ...OPEN_FITNESS,
        appId: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('what is asked of the app', () => {
  it('needs a target to open or point and none to dismiss', async () => {
    const dana = addPerson(test, 'Dana', 'member');
    foreground = new Set([dana.client.id]);
    for (const action of ['open', 'highlight'] as const) {
      await expect(showInApp(desk(), asClient(dana.client), { action })).rejects.toMatchObject({
        code: 'invalid_request',
        message: `${action} needs a target.`,
      });
    }
    expect(asked).toEqual([]);
    await showInApp(desk(), asClient(dana.client), { action: 'dismiss' });
    expect(asked[0]?.ask).toEqual({ action: 'dismiss', target: null, focus: null });
  });

  it('passes the focus on', async () => {
    const dana = addPerson(test, 'Dana', 'member');
    foreground = new Set([dana.client.id]);
    await showInApp(desk(), asClient(dana.client), { ...OPEN_FITNESS, focus: 'sleep' });
    expect(asked[0]?.ask.focus).toBe('sleep');
  });
});

describe('what comes back', () => {
  async function run(): ReturnType<typeof showInApp> {
    const dana = addPerson(test, 'Dana', 'member');
    foreground = new Set([dana.client.id]);
    return showInApp(desk(), asClient(dana.client), OPEN_FITNESS);
  }

  it('reports a pointer that found nothing on screen', async () => {
    outcome = {
      kind: 'answered',
      result: { ok: true, opened: 'Fitness', highlighted: false, reason: 'not_on_screen' },
    };
    await expect(run()).resolves.toMatchObject({
      ok: true,
      highlighted: false,
      reason: 'not_on_screen',
    });
  });

  it('says why the app refused', async () => {
    outcome = { kind: 'answered', result: { ok: false, reason: 'app_not_in_front' } };
    await expect(run()).resolves.toEqual({
      ok: false,
      app: 'Dana phone',
      reason: 'app_not_in_front',
      detail: 'The app is open but not in front, or its screen is off.',
    });
    outcome = { kind: 'answered', result: { ok: false, reason: 'target_not_found' } };
    await expect(run()).resolves.toMatchObject({ ok: false, reason: 'target_not_found' });
  });

  it('says the app is not connected when it has no live link', async () => {
    outcome = { kind: 'not_reached' };
    await expect(run()).resolves.toMatchObject({ ok: false, reason: 'not_connected' });
  });

  it('says the app did not answer in time', async () => {
    outcome = { kind: 'unanswered' };
    await expect(run()).resolves.toMatchObject({ ok: false, reason: 'no_answer' });
  });
});
