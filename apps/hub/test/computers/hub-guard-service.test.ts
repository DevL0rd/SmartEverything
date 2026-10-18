import { randomUUID } from 'node:crypto';
import {
  HUB_AI_REFUSAL,
  HUB_GUARD_MESSAGE,
  type ClientRow,
  type HubFrame,
  type NodeRequest,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import { ComputerService } from '../../src/computers/computer-service';
import type { Caller } from '../../src/server/auth';
import { z } from 'zod';
import { captureLogs, testLogger } from '../support/logs';
import { HELLO, sessionRig } from '../support/session-rig';
import { testStore, type TestStore } from '../support/store';

const HUB_PID = 4242;

const STOP_HUB: NodeRequest = {
  verb: 'service_set',
  change: { action: 'service', unit: 'smarteverything.service', operation: 'stop' },
};

const KILL_HUB: NodeRequest = { verb: 'signal', pid: HUB_PID, signal: 'force' };

interface Rig {
  readonly service: ComputerService;
  readonly deviceId: string;
  readonly directory: ComputerDirectory;
  readonly sent: HubFrame[];
  readonly owner: ClientRow;
  readonly reply: () => void;
}

let opened: TestStore;

function rig(): Rig {
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'computer:hub',
      parentId: null,
      kind: 'computer',
      name: 'Hub box',
      model: 'smarteverything.computer',
      manufacturer: 'Linux',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  const deviceId = device?.id ?? '';
  const directory = new ComputerDirectory(HELLO.machineId);
  const { session, sent, deliver } = sessionRig(deviceId, { directory });
  directory.add(session);
  const service = new ComputerService({
    store: opened.store,
    directory,
    log: testLogger('computers'),
    hubPid: HUB_PID,
  });
  const owner = opened.store.clients.create(
    { name: 'Pixel', platform: 'android', role: 'owner', tokenHash: 'b'.repeat(64) },
    true,
  );
  const reply = (): void => {
    const request = sent.findLast((frame) => frame.type === 'request');
    if (request?.type === 'request') {
      deliver({ type: 'reply', id: request.id, result: { ok: true, value: null } });
    }
  };
  return { service, deviceId, directory, sent, owner, reply };
}

function requests(sent: readonly HubFrame[]): HubFrame[] {
  return sent.filter((frame) => frame.type === 'request');
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('hub guard through the computer service', () => {
  it.each([STOP_HUB, KILL_HUB])(
    'refuses an assistant caller even with confirmation, and never reaches the computer',
    async (request) => {
      const { service, deviceId, sent, owner } = rig();
      const assistant: Caller = { kind: 'client', client: owner, via: 'assistant' };
      await expect(
        service.ask({ caller: assistant, deviceId, request, confirmed: true }, z.unknown()),
      ).rejects.toMatchObject({ message: HUB_AI_REFUSAL });
      expect(requests(sent)).toHaveLength(0);
    },
  );

  it('refuses a service caller (an automation or plugin) even with confirmation', async () => {
    const { service, deviceId, sent, owner } = rig();
    const caller: Caller = {
      kind: 'service',
      authority: {
        event_id: randomUUID(),
        profile_id: randomUUID(),
        client_id: null,
        kind: 'service',
        role: 'owner',
        hub_os_ban: false,
        tools: null,
        plugin_id: null,
        requester: 'owner',
      },
      profileId: opened.store.profiles.activeOf(owner.id).id,
      chatId: null,
    };
    await expect(
      service.ask({ caller, deviceId, request: STOP_HUB, confirmed: true }, z.unknown()),
    ).rejects.toMatchObject({ message: HUB_AI_REFUSAL });
    expect(requests(sent)).toHaveLength(0);
  });

  it('asks a person for confirmation first', async () => {
    const { service, deviceId, sent, owner } = rig();
    const person: Caller = { kind: 'client', client: owner };
    await expect(
      service.ask({ caller: person, deviceId, request: STOP_HUB }, z.unknown()),
    ).rejects.toMatchObject({ message: HUB_GUARD_MESSAGE });
    expect(requests(sent)).toHaveLength(0);
  });

  it('lets a confirmed person through to the computer', async () => {
    const { service, deviceId, sent, owner, reply } = rig();
    const person: Caller = { kind: 'client', client: owner };
    const done = service.ask(
      { caller: person, deviceId, request: STOP_HUB, confirmed: true },
      z.unknown(),
    );
    expect(requests(sent)).toHaveLength(1);
    reply();
    await expect(done).resolves.toBeNull();
  });

  it('does not stop an assistant caller from other requests on the hub machine', async () => {
    const { service, deviceId, sent, owner, reply } = rig();
    const assistant: Caller = { kind: 'client', client: owner, via: 'assistant' };
    const done = service.ask(
      { caller: assistant, deviceId, request: { verb: 'signal', pid: 7, signal: 'end' } },
      z.unknown(),
    );
    expect(requests(sent)).toHaveLength(1);
    reply();
    await expect(done).resolves.toBeNull();
  });
});
