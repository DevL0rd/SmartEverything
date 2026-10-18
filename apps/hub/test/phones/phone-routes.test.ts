import { createHash } from 'node:crypto';
import {
  API_ENDPOINTS as E,
  PHONE_DETAIL,
  PHONE_ICON_UPLOAD,
  type DeviceEvent,
  type PhoneAction,
  type PhoneActionOrigin,
  type PhoneActionResult,
  type PhoneRunAction,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { phoneRoutes } from '../../src/phones/phone-routes';
import type { Caller } from '../../src/server/auth';
import { captureLogs, testLogger } from '../support/logs';
import {
  addPerson,
  addPhoneDevice,
  STORED_DETAIL,
  idlePhoneNodes,
  REPORT_AT,
  type TestPerson,
} from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOTICE_REQUEST = '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73';
const WEBP = Buffer.from('RIFF0000WEBPVP8 payload', 'latin1');
const HASH = createHash('sha256').update(WEBP).digest('hex');

let test: TestStore;
let dana: TestPerson;
let sam: TestPerson;
let owner: TestPerson;
let phoneId: string;
let ran: PhoneRunAction[];
let origins: PhoneActionOrigin[];
let outcome: PhoneActionResult;
let shown: string[];
let events: DeviceEvent[];
let routes: ReturnType<typeof phoneRoutes>;

function caller(person: TestPerson): Caller {
  return { kind: 'client', client: person.client };
}

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  dana = addPerson(test, 'Dana', 'member');
  sam = addPerson(test, 'Sam', 'member');
  owner = addPerson(test, 'Owner', 'owner');
  phoneId = addPhoneDevice(test, {
    clientId: dana.client.id,
    profileId: dana.profileId,
    name: 'Dana phone',
  }).device.id;
  test.store.phoneDetails.merge(phoneId, STORED_DETAIL);
  ran = [];
  origins = [];
  shown = [];
  outcome = { ok: true, detail: 'Done.' };
  events = [];
  const phones = idlePhoneNodes(test, (event) => events.push(event));
  routes = phoneRoutes({
    store: test.store,
    hub: { phones },
    actions: {
      run: (_target, action, origin): Promise<PhoneActionResult> => {
        ran.push(action);
        origins.push(origin);
        return Promise.resolve(outcome);
      },
      answer: (): void => undefined,
    },
    approvals: { has: (): boolean => false, answer: (): void => undefined },
    notifications: {
      has: (requestId): boolean => requestId === NOTICE_REQUEST,
      answer: (_client, requestId): void => {
        shown.push(requestId);
      },
    },
    now: () => new Date(REPORT_AT),
    files: (_caller, fileId) => ({
      type: 'receive_file',
      fileId,
      name: 'ticket.pdf',
      mime: 'application/pdf',
      url: '/media/assistant/ticket',
    }),
  });
});

afterEach(async () => {
  await test.close();
});

function raw(parts: { params?: unknown; query?: unknown; body?: unknown }): {
  params: unknown;
  query: unknown;
  body: unknown;
  remote: string;
} {
  return { params: {}, query: {}, body: undefined, remote: 'test', ...parts };
}

function detailOf(person: TestPerson, query: unknown = {}): Promise<unknown> {
  return routes.readPhoneDetail.run(
    caller(person),
    raw({ params: { deviceId: phoneId }, query }),
    testLogger(),
  );
}

describe('reading phone detail', () => {
  it('shows a person everything of their own phone', async () => {
    const detail = PHONE_DETAIL.parse(await detailOf(dana));
    expect(detail.notifications?.items).toHaveLength(1);
    expect(detail.network?.wifi?.ssid).toBe('Home');
  });

  it('shows the owner totals and another member almost nothing', async () => {
    expect(PHONE_DETAIL.parse(await detailOf(owner)).notifications).toMatchObject({
      count: 4,
      items: null,
    });
    expect(Object.keys(PHONE_DETAIL.parse(await detailOf(sam))).sort()).toEqual([
      'alarm',
      'network',
      'power',
      'screen',
      'sound',
    ]);
  });

  it('keeps to the sections named in the query', async () => {
    const detail = PHONE_DETAIL.parse(await detailOf(dana, { sections: 'power,alarm' }));
    expect(Object.keys(detail).sort()).toEqual(['alarm', 'power']);
  });

  it('refuses a section name it does not know', async () => {
    await expect(detailOf(dana, { sections: 'secrets' })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('refuses a device that is not a phone running SmartEverything', async () => {
    const [lamp] = test.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'light:1',
        parentId: null,
        kind: 'light',
        name: 'Lamp',
        model: 'm',
        manufacturer: 'v',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    await expect(
      routes.readPhoneDetail.run(
        caller(dana),
        raw({ params: { deviceId: lamp?.id }, query: {} }),
        testLogger(),
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});

describe('asking a phone to act', () => {
  function act(person: TestPerson, body: PhoneAction): Promise<unknown> {
    return routes.runPhoneAction.run(
      caller(person),
      raw({ params: { deviceId: phoneId }, body }),
      testLogger(),
    );
  }

  it('lets the phone’s person and an owner act', async () => {
    await act(dana, { type: 'ring', on: true });
    await act(owner, { type: 'set_brightness', percent: 30 });
    expect(ran.map((action) => action.type)).toEqual(['ring', 'set_brightness']);
  });

  it('records a screenshot or a ring in the device event feed with who asked', async () => {
    await act(dana, { type: 'screenshot' });
    await act(owner, { type: 'set_brightness', percent: 30 });
    expect(events.map((event) => [event.kind, event.details])).toEqual([
      ['machine_action', { action: 'screenshot', source: 'app', client: dana.client.name }],
    ]);
  });

  it('tells the phone who asked so it can say so on its own screen', async () => {
    await act(dana, { type: 'screenshot' });
    expect(origins).toEqual([{ source: 'app', client: dana.client.name }]);
  });

  it('leaves a refused or failed action out of the feed', async () => {
    outcome = { ok: false, detail: 'Android did not return the screenshot' };
    await act(dana, { type: 'screenshot' });
    expect(events).toEqual([]);
  });

  it('lets nobody but the phone’s own person look at its screen', async () => {
    await expect(act(owner, { type: 'screenshot' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(ran).toEqual([]);
  });

  it('hands a notification confirmation to the live link and not to the action broker', async () => {
    await routes.answerPhoneAction.run(
      caller(dana),
      raw({ body: { requestId: NOTICE_REQUEST, ok: true, detail: 'Shown' } }),
      testLogger(),
    );
    expect(shown).toEqual([NOTICE_REQUEST]);
  });

  it('sends a file as its name, type and signed link, not the bare id', async () => {
    const fileId = '3d000000-0000-4000-8000-000000000031';
    await act(dana, { type: 'receive_file', fileId });
    expect(ran).toEqual([
      {
        type: 'receive_file',
        fileId,
        name: 'ticket.pdf',
        mime: 'application/pdf',
        url: '/media/assistant/ticket',
      },
    ]);
  });

  it('refuses another member', async () => {
    await expect(act(sam, { type: 'ring', on: true })).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(ran).toEqual([]);
  });

  it('lets only the phone’s own person dismiss its notifications', async () => {
    const dismiss: PhoneAction = {
      type: 'dismiss_notification',
      target: { by: 'key', key: 'k1' },
    };
    await expect(act(owner, dismiss)).rejects.toMatchObject({ code: 'forbidden' });
    await act(dana, dismiss);
    expect(ran).toEqual([dismiss]);
  });

  it('does not accept the hub-internal live action from outside', () => {
    expect(E.runPhoneAction.body.safeParse({ type: 'live', on: true }).success).toBe(false);
  });
});

describe('app icons', () => {
  const upload = { hash: HASH, webpBase64: WEBP.toString('base64') };

  function send(body: unknown): Promise<unknown> {
    return routes.uploadPhoneIcon.run(caller(dana), raw({ body }), testLogger());
  }

  it('keeps an uploaded icon and gives it back by hash', async () => {
    await send(upload);
    const icon = await routes.readPhoneIcon.run(
      caller(sam),
      raw({ params: { hash: HASH } }),
      testLogger(),
    );
    expect(PHONE_ICON_UPLOAD.parse(icon)).toEqual(upload);
  });

  it('refuses an icon whose bytes do not match its hash', async () => {
    await expect(send({ ...upload, hash: 'b'.repeat(64) })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('refuses bytes that are not a WebP image', async () => {
    const bytes = Buffer.from('not an image');
    await expect(
      send({
        hash: createHash('sha256').update(bytes).digest('hex'),
        webpBase64: bytes.toString('base64'),
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('says so when no icon has the hash', async () => {
    await expect(
      routes.readPhoneIcon.run(
        caller(dana),
        raw({ params: { hash: 'c'.repeat(64) } }),
        testLogger(),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
