import { randomUUID } from 'node:crypto';
import { COMPUTER_SCOPE_OFF, type ClientRow, type HubFrame } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import { ComputerService } from '../../src/computers/computer-service';
import type { Caller } from '../../src/server/auth';
import { captureLogs, testLogger } from '../support/logs';
import { HELLO, sessionRig } from '../support/session-rig';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

interface Rig {
  readonly service: ComputerService;
  readonly deviceId: string;
  readonly sent: HubFrame[];
  readonly owner: ClientRow;
  readonly member: ClientRow;
  readonly reply: () => void;
}

function rig(): Rig {
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'computer:desk',
      parentId: null,
      kind: 'computer',
      name: 'Desk',
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
  });
  const owner = opened.store.clients.create(
    { name: 'Pixel', platform: 'android', role: 'owner', tokenHash: 'b'.repeat(64) },
    true,
  );
  const member = opened.store.clients.create(
    { name: 'Tablet', platform: 'android', role: 'member', tokenHash: 'c'.repeat(64) },
    true,
  );
  const reply = (): void => {
    const request = sent.findLast((frame) => frame.type === 'request');
    if (request?.type === 'request') {
      deliver({ type: 'reply', id: request.id, result: { ok: true, value: null } });
    }
  };
  return { service, deviceId, sent, owner, member, reply };
}

function asked(sent: readonly HubFrame[]): HubFrame[] {
  return sent.filter((frame) => frame.type === 'request');
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

const CLICK = { verb: 'input', input: { action: 'click', x: 5, y: 6 } } as const;

describe('input through the computer service', () => {
  it('is refused while the permission is off and never reaches the computer', async () => {
    const { service, deviceId, sent, owner } = rig();
    const assistant: Caller = { kind: 'client', client: owner, via: 'assistant' };
    await expect(
      service.ask({ caller: assistant, deviceId, request: CLICK }, z.unknown()),
    ).rejects.toMatchObject({ message: COMPUTER_SCOPE_OFF.input });
    expect(asked(sent)).toHaveLength(0);
  });

  it('reaches the computer once the permission is on', async () => {
    const { service, deviceId, sent, owner, reply } = rig();
    opened.store.computerScopes.update(deviceId, { input: true });
    const assistant: Caller = { kind: 'client', client: owner, via: 'assistant' };
    const done = service.ask({ caller: assistant, deviceId, request: CLICK }, z.unknown());
    expect(asked(sent)).toHaveLength(1);
    reply();
    await expect(done).resolves.toBeNull();
  });

  it('hides the computer from a member who is not its person, even with the permission on', async () => {
    const { service, deviceId, sent, member } = rig();
    opened.store.computerScopes.update(deviceId, { input: true });
    const assistant: Caller = { kind: 'client', client: member, via: 'assistant' };
    await expect(
      service.ask({ caller: assistant, deviceId, request: CLICK }, z.unknown()),
    ).rejects.toMatchObject({ message: 'That device is not a computer.' });
    expect(asked(sent)).toHaveLength(0);
  });

  it('keeps the permission off for a computer nobody changed, and stores it when turned on', () => {
    const { deviceId } = rig();
    const other = randomUUID();
    expect(opened.store.computerScopes.read(other).input).toBe(false);
    expect(opened.store.computerScopes.read(deviceId).input).toBe(false);
    expect(opened.store.computerScopes.update(deviceId, { input: true }).input).toBe(true);
    expect(opened.store.computerScopes.read(deviceId).input).toBe(true);
    expect(opened.store.computerScopes.read(deviceId).screenshots).toBe(true);
  });
});
