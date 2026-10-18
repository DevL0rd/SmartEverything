import { randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS,
  type ClientRow,
  type EndpointName,
  type PhoneActionResult,
  type ProfileRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { machineOf, phoneShot } from '../../src/extensions/mcp/tools/see';
import type { ToolContext } from '../../src/extensions/mcp/tools/registry';
import { systemClock } from '../../src/clock';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const PICTURE = Buffer.from('a screenshot').toString('base64');
const NOW = '2026-10-18T10:00:00.000Z';

interface Call {
  readonly name: EndpointName;
  readonly params: Record<string, string>;
  readonly body: unknown;
}

let opened: TestStore;
let calls: Call[];
let answer: PhoneActionResult;
let owner: ClientRow;
let profile: ProfileRow;

function context(): OperatingContext & Pick<ToolContext, 'clock'> {
  return {
    store: opened.store,
    caller: null,
    actor: { clientId: owner.id, profileId: profile.id, chatId: null },
    clock: { ...systemClock, now: () => new Date(NOW) },
    operations: {
      run: (name, _caller, input): Promise<unknown> => {
        const endpoint = API_ENDPOINTS[name];
        endpoint.params.parse(input.params ?? {});
        if (input.body !== undefined) endpoint.body.parse(input.body);
        calls.push({ name, params: input.params ?? {}, body: input.body });
        return Promise.resolve(answer);
      },
    },
  };
}

function addPhone(name: string): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: `phone:${randomUUID()}`,
      parentId: null,
      kind: 'phone',
      name,
      model: 'm',
      manufacturer: 'Google',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  return row?.id ?? '';
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  calls = [];
  answer = { ok: true, detail: 'Took a screenshot', image: PICTURE };
  profile = opened.store.profiles.first();
  owner = opened.store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
});

afterEach(async () => {
  await opened.close();
});

describe('seeing a phone screen', () => {
  it('asks the chosen phone for a screenshot and returns the picture', async () => {
    const pixel = addPhone('Pixel');
    addPhone('Galaxy');
    const found = machineOf(context(), 'phone', 'pixel');
    expect(found.device.id).toBe(pixel);
    const shot = await phoneShot(context(), found);
    expect(shot).toEqual({ data: PICTURE, at: NOW });
    expect(calls).toEqual([
      { name: 'runPhoneAction', params: { deviceId: pixel }, body: { type: 'screenshot' } },
    ]);
  });

  it('uses the only phone when none is named and asks which when there are several', () => {
    const pixel = addPhone('Pixel');
    expect(machineOf(context(), 'phone', undefined).device.id).toBe(pixel);
    addPhone('Galaxy');
    expect(() => machineOf(context(), 'phone', undefined)).toThrow(/Say which phone: .*Galaxy/);
    expect(() => machineOf(context(), 'phone', undefined)).toThrow(/Pixel/);
  });

  it('says there is no phone when none is paired', () => {
    expect(() => machineOf(context(), 'phone', undefined)).toThrow('no phone to look at');
  });

  it('passes on the phone’s own reason when it cannot take the picture', async () => {
    addPhone('Pixel');
    const found = machineOf(context(), 'phone', 'Pixel');
    answer = {
      ok: false,
      detail: 'Screenshots need the SmartEverything accessibility service turned on.',
    };
    await expect(phoneShot(context(), found)).rejects.toThrow('accessibility service');
  });

  it('refuses an answer without a picture or with one too large for an assistant', async () => {
    addPhone('Pixel');
    const found = machineOf(context(), 'phone', 'Pixel');
    answer = { ok: true, detail: 'done' };
    await expect(phoneShot(context(), found)).rejects.toThrow('answered without a picture');
    answer = {
      ok: true,
      detail: 'done',
      image: Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64'),
    };
    await expect(phoneShot(context(), found)).rejects.toThrow('too large');
  });
});
