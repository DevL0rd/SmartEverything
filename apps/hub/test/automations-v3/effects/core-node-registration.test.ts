import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AutomationAiSlot } from '../../../src/automations/automation-ai';
import { AutomationComputersSlot } from '../../../src/automations/automation-computers';
import { AutomationIntegrationSlot } from '../../../src/automations/automation-integration';
import { WebhookReplies } from '../../../src/automations/effects/webhook-replies';
import { AutomationImagesSlot } from '../../../src/automations/effects/image-nodes';
import { QuestionDesk } from '../../../src/automations/questions/desk';
import { coreNodeEffects } from '../../../src/automations/effects/core-node-effects';
import { coreNodeReadHandlers } from '../../../src/automations/world-v3/core-node-reads';
import { createWorldReads } from '../../../src/automations/world-v3/world-reads';
import { SCOPE, furnish, type Home } from '../world/support';
import { testRun } from './support';

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

const NO_CLIPS = {
  issue: (): never => {
    throw new Error('a clip must not be recorded by this test');
  },
};

const NO_DRIVE = {
  change: (): never => {
    throw new Error('a drive change must not be made by this test');
  },
};

function request(kind: string, params: EffectRequest['params']): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'idempotent',
    budget: 'command',
  };
}

function cameraHandlers(home: Home): ReturnType<typeof coreNodeEffects> {
  const integration = new AutomationIntegrationSlot();
  integration.attach({
    model: {
      ask: (): never => {
        throw new Error('not used by this test');
      },
      decide: (): never => {
        throw new Error('not used by this test');
      },
    },
    pictures: {
      take: (deviceId) =>
        Promise.resolve({ id: `picture-of-${deviceId}`, at: '2026-10-18T12:00:00.000Z' }),
      load: (): never => {
        throw new Error('not used by this test');
      },
    },
    computers: new AutomationComputersSlot(),
    tools: {
      check: (): never => {
        throw new Error('not used by this test');
      },
      call: (): never => {
        throw new Error('not used by this test');
      },
    },
    signals: { emit: (): void => undefined },
    replies: new WebhookReplies(),
    clock: { now: (): Date => new Date(home.clock.current) },
    ownerProfileId: () => 'profile-1',
  });
  return coreNodeEffects({
    store: home.test.store,
    setter: {
      set: (): never => {
        throw new Error('not used by this test');
      },
      setTogether: (): never => {
        throw new Error('not used by this test');
      },
    },
    issuer: NO_CLIPS,
    clock: {
      now: (): Date => new Date(home.clock.current),
      at: (): (() => void) => () => undefined,
    },
    events: { record: (): void => undefined },
    ai: new AutomationAiSlot(),
    computers: new AutomationComputersSlot(),
    questions: new QuestionDesk({
      questions: home.test.store.automationQuestions,
      clock: { now: (): Date => new Date(home.clock.current) },
    }),
    integration,
    images: new AutomationImagesSlot(),
    drive: NO_DRIVE,
  });
}

describe('core node registration points', () => {
  it('register only handlers that run', () => {
    const handlers = coreNodeEffects({
      store: home.test.store,
      setter: {
        set: (): never => {
          throw new Error('not used by this test');
        },
        setTogether: (): never => {
          throw new Error('not used by this test');
        },
      },
      clock: {
        now: (): Date => new Date(home.clock.current),
        at: (): (() => void) => () => undefined,
      },
      events: { record: (): void => undefined },
      ai: new AutomationAiSlot(),
      computers: new AutomationComputersSlot(),
      questions: new QuestionDesk({
        questions: home.test.store.automationQuestions,
        clock: { now: (): Date => new Date(home.clock.current) },
      }),
      issuer: NO_CLIPS,
      integration: new AutomationIntegrationSlot(),
      images: new AutomationImagesSlot(),
      drive: NO_DRIVE,
    });
    expect(Object.values(handlers).every((handler) => typeof handler === 'function')).toBe(true);
  });

  it('register only read handlers that run and leave the existing reads working', () => {
    expect(
      Object.values(coreNodeReadHandlers(home.deps)).every(
        (handler) => typeof handler === 'function',
      ),
    ).toBe(true);
    const reads = createWorldReads(home.deps);
    expect(reads.read('var.secret', { secret: 'secret-1' }, SCOPE).outputs).toEqual({
      secret: 'secret-1',
    });
  });

  it('serves camera.snapshot and camera.record from the capture handlers', async () => {
    const handlers = cameraHandlers(home);
    const snapshot = handlers['camera.snapshot'];
    const record = handlers['camera.record'];
    if (snapshot === undefined || record === undefined)
      throw new Error('a camera capture kind has no handler');
    const run = testRun();
    const neither = await snapshot({}, request('camera.snapshot', {}), run);
    expect(neither).toMatchObject({ ok: false, class: 'Invalid' });
    const taken = await snapshot(
      { camera: 'camera-1' },
      request('camera.snapshot', { camera: 'camera-1' }),
      run,
    );
    expect(taken).toMatchObject({
      ok: true,
      value: {
        image: 'picture-of-camera-1',
        images: ['picture-of-camera-1'],
        cameras: [{ device: 'camera-1' }],
        skipped: [],
      },
    });
    const missing = await record(
      { camera: 'camera-1', seconds: 5 },
      request('camera.record', { camera: 'camera-1', seconds: 5 }),
      run,
    );
    expect(missing).toMatchObject({ ok: false });
  });
});
