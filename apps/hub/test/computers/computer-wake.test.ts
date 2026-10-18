import type { AiOutreachRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { answeredBy, wakeComputer } from '../../src/computers/computer-wake';
import type { ReachService } from '../../src/reach/reach-service';
import { WakeClaims } from '../../src/wake-name/wake-claims';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = '2026-10-18T10:00:00.000Z';
const DEN = '5b1e2f57-0d5e-4a43-9a3f-0b1d3c3c1f02';

let test: TestStore;

beforeEach(async () => {
  test = await testStore();
});

afterEach(async () => {
  await test.close();
});

function outreach(): AiOutreachRow {
  return test.store.aiOutreach.add({
    profile_id: test.store.profiles.first().id,
    chat_id: null,
    from_chat_id: null,
    how: 'desktop',
    target: DEN,
    target_label: 'Den PC',
    reason: 'wake',
    urgent: false,
    state: 'live',
    detail: null,
    expires_at: null,
    origin: null,
  });
}

function service(row: AiOutreachRow, hungUp: string[]): Pick<ReachService, 'computer' | 'hangUp'> {
  return {
    computer: () => Promise.resolve(row),
    hangUp: (id): Promise<AiOutreachRow> => {
      hungUp.push(id);
      return Promise.resolve(test.store.aiOutreach.byId(id));
    },
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('computer wake', () => {
  it('hangs up the conversation and records who answered when another source takes over', async () => {
    const claims = new WakeClaims({ clock: new FakeClock(START), log: testLogger('claims') });
    const hungUp: string[] = [];
    const row = outreach();
    const grant = claims.request({ source: 'computer', key: DEN, snippetDbfs: -30 });
    await wakeComputer(
      { store: test.store, service: service(row, hungUp), log: testLogger('wake') },
      { computerId: DEN, phrase: 'hey jarvis', heard: () => new Int16Array(0) },
      grant.onSuperseded,
    );
    claims.request({ source: 'voice_call', key: 'discord:ann', snippetDbfs: -60 });
    await settle();
    expect(hungUp).toEqual([row.id]);
    expect(test.store.aiOutreach.byId(row.id)).toMatchObject({
      state: 'ended',
      detail: 'Answered by Discord',
    });
  });

  it('names every kind of winner', () => {
    expect(answeredBy({ source: 'phone', key: 'p', snippetDbfs: -20 })).toBe('a phone');
    expect(answeredBy({ source: 'talk', key: 't', snippetDbfs: -20 })).toBe(
      'a walkie-talkie channel',
    );
    expect(answeredBy({ source: 'camera', key: 'c', snippetDbfs: -20 })).toBe('a camera');
    expect(answeredBy({ source: 'computer', key: 'k', snippetDbfs: -20 })).toBe('another computer');
  });
});
