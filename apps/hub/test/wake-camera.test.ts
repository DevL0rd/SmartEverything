import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiOutreachRow } from '@smarteverything/domain';
import type { ReachService } from '../src/reach/reach-service';
import { wakeCamera } from '../src/server/wake-wiring';
import { WakeClaims, type WakeSource } from '../src/wake-name/wake-claims';
import { FakeClock } from './support/fake-clock';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

const START = '2026-10-17T10:00:00.000Z';

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
    how: 'camera',
    target: 'living',
    target_label: 'Living room',
    reason: 'wake',
    urgent: false,
    state: 'live',
    detail: null,
    expires_at: null,
    origin: null,
  });
}

function service(row: AiOutreachRow, hungUp: string[]): Pick<ReachService, 'camera' | 'hangUp'> {
  return {
    camera: () => Promise.resolve(row),
    hangUp: (id): Promise<AiOutreachRow> => {
      hungUp.push(id);
      return Promise.resolve(test.store.aiOutreach.byId(id));
    },
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('camera wake superseded', () => {
  it('hangs up the camera conversation and records who answered', async () => {
    const clock = new FakeClock(START);
    const claims = new WakeClaims({ clock, log: testLogger('claims') });
    const hungUp: string[] = [];
    const row = outreach();
    const grant = claims.request({ source: 'camera', key: 'living', snippetDbfs: -30 });
    await wakeCamera(
      { store: test.store, service: service(row, hungUp), log: testLogger('wake') },
      { cameraId: 'living', phrase: 'hey jarvis', heard: () => new Int16Array(0) },
      grant.onSuperseded,
    );
    const source: WakeSource = 'voice_call';
    claims.request({ source, key: 'discord:ann', snippetDbfs: -60 });
    await settle();
    expect(hungUp).toEqual([row.id]);
    expect(test.store.aiOutreach.byId(row.id)).toMatchObject({
      state: 'ended',
      detail: 'Answered by Discord',
    });
  });

  it('hangs up once the conversation has opened when the takeover came first', async () => {
    const clock = new FakeClock(START);
    const claims = new WakeClaims({ clock, log: testLogger('claims') });
    const hungUp: string[] = [];
    const row = outreach();
    const grant = claims.request({ source: 'camera', key: 'living', snippetDbfs: -30 });
    const waking = wakeCamera(
      { store: test.store, service: service(row, hungUp), log: testLogger('wake') },
      { cameraId: 'living', phrase: 'hey jarvis', heard: () => new Int16Array(0) },
      grant.onSuperseded,
    );
    claims.request({ source: 'camera', key: 'bedroom', snippetDbfs: -10 });
    expect(hungUp).toEqual([]);
    await waking;
    await settle();
    expect(hungUp).toEqual([row.id]);
    expect(test.store.aiOutreach.byId(row.id).detail).toBe('Answered by another camera');
  });

  it('leaves the conversation alone when nothing takes over', async () => {
    const claims = new WakeClaims({ clock: new FakeClock(START), log: testLogger('claims') });
    const hungUp: string[] = [];
    const grant = claims.request({ source: 'camera', key: 'living', snippetDbfs: -30 });
    await wakeCamera(
      { store: test.store, service: service(outreach(), hungUp), log: testLogger('wake') },
      { cameraId: 'living', phrase: 'hey jarvis', heard: () => new Int16Array(0) },
      grant.onSuperseded,
    );
    await settle();
    expect(hungUp).toEqual([]);
  });
});
