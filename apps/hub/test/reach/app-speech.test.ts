import {
  createClientToken,
  hashClientToken,
  type AiSpeechNotice,
  type ClientRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PushCommandOutcome, PushCommandRequest } from '../../src/extensions/push/commands';
import { AppSpeech } from '../../src/reach/app-speech';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { until } from '../support/wait';

let test: TestStore;
let client: ClientRow;

beforeEach(async () => {
  test = await testStore();
  client = test.store.clients.create({
    name: 'Phone',
    platform: 'android',
    role: 'owner',
    tokenHash: hashClientToken(createClientToken()),
  });
});

afterEach(async () => {
  await test.close();
});

const notice: AiSpeechNotice = {
  type: 'ai_speech',
  id: 'speech-1',
  from: 'Ai',
  text: 'The washing is done',
  audio: 'AA==',
};

function rig(openApps: number): {
  readonly speech: AppSpeech;
  readonly pushes: PushCommandRequest[];
} {
  const pushes: PushCommandRequest[] = [];
  const speech = new AppSpeech({
    online: (): ReadonlySet<string> => new Set(),
    toClient: (): Promise<number> => Promise.resolve(openApps),
    pushTargets: (): ReadonlySet<string> => new Set([client.id]),
    pushConfigured: (): boolean => true,
    push: {
      send: (request): Promise<PushCommandOutcome> => {
        pushes.push(request);
        return Promise.resolve({ outcome: 'sent' });
      },
    },
    clock: new FakeClock('2026-10-19T14:00:00.000Z'),
    log: testLogger('app-speech'),
  });
  return { speech, pushes };
}

describe('speech for a phone whose app is not open in front', () => {
  it('wakes the phone by push and counts as spoken once the phone claims it', async () => {
    const { speech, pushes } = rig(0);
    const played = speech.play(client, notice);
    await until(() => pushes.length === 1, 'the push to be sent');
    expect(pushes[0]).toMatchObject({ clientId: client.id, command: 'ai_speech' });
    expect(speech.fetch(client.id, notice.id)).toStrictEqual(notice);
    await expect(played).resolves.toBeNull();
  });

  it('is handed straight to the open app without a push', async () => {
    const { speech, pushes } = rig(1);
    await expect(speech.play(client, notice)).resolves.toBeNull();
    expect(pushes).toStrictEqual([]);
  });
});
