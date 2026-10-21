import { randomUUID } from 'node:crypto';
import type { NodeHello } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toolAdmission } from '../../../src/ai-tools/tool-admission';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import type { HubTool, HubToolResult, ToolSource } from '../../../src/ai-tools/hub-tool';
import { HarnessHubTools } from '../../../src/harness/tools';
import { eventAuthority, withExecutionAuthority } from '../../../src/assistant/turn-authority';
import { describeComputer } from '../../../src/computers/computer-device';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import { HubLocalBoundary } from '../../../src/harness/hub-local-boundary';
import { reachesNativeBridge } from '../../../src/harness/native-bridge';
import { harnessRig, type Rig } from '../harness/support/rig';

let rig: Rig;
let desk: string;
let hubMachine: string;

const HUB_MACHINE: NodeHello = {
  machineId: 'b'.repeat(32),
  hostname: 'hub',
  os: { name: 'Linux', kernel: '6.0' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'CPU', threads: 2, hybrid: false, kinds: [] },
  memoryBytes: 8e9,
  interfaces: [],
  bootedAt: '2026-10-08T09:00:00.000Z',
  features: [],
  role: 'pc',
  power: [],
  actions: [],
  permissions: [],
};

beforeEach(async () => {
  rig = await harnessRig();
  const target = rig.desk.target;
  if (target.kind !== 'device') throw new Error('The desk is not a device host.');
  desk = target.device_id;
  const [row] = rig.opened.store.devices.upsert([
    {
      ...describeComputer(HUB_MACHINE, 'hub', [], { power: [], machine: [] }),
      parentId: null,
      providerRoom: null,
      roomId: null,
      online: true,
    },
  ]);
  if (row === undefined) throw new Error('The hub machine was not stored.');
  hubMachine = row.id;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rig.close();
});

const CONTROL_DEVICES: HubTool = {
  name: 'device_control',
  title: 'Control devices',
  description: 'Changes devices.',
  inputSchema: { type: 'object' },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'core' },
  humanOnly: false,
};

function controlDevices(reached: string[]): ToolSource {
  return {
    tools: () => [CONTROL_DEVICES],
    validate: () => null,
    changes: (): (() => void) => () => undefined,
    call: (_tool, args): Promise<HubToolResult> => {
      const room = /"rooms":\["([^"]+)"/.exec(JSON.stringify(args))?.[1];
      reached.push(
        ...rig.opened.store.devices
          .list()
          .flatMap((device) => (device.room_id === room ? [device.id] : [])),
      );
      return Promise.resolve({ response: { ok: true }, line: '', pictures: [] });
    },
  };
}

function hubTools(source: ToolSource): HarnessHubTools {
  return new HarnessHubTools(rig.service, new ToolHub([source]));
}

function deskSession(): string {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.desk.target);
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: null,
    profile_id: rig.owner.profileId,
    client_id: rig.clientId,
    text: 'turn off the office',
  });
  eventAuthority(store, event);
  return rig.service.prepare(rig.owner, chat.id, {
    kind: 'trigger',
    profileId: rig.owner.profileId,
    grantId: event.id,
  }).claim.session_id;
}

function hubChat(): ConversationAuthority {
  const chat = rig.newChat({ kind: 'device', device_id: desk });
  const { store } = rig.opened;
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: null,
    profile_id: rig.owner.profileId,
    client_id: rig.clientId,
    text: 'hello',
  });
  return eventAuthority(store, event);
}

function boundary(local?: string): HubLocalBoundary {
  if (local !== undefined) rig.opened.store.computerAi.bindLocal(local);
  return new HubLocalBoundary(rig.opened.store);
}

describe('a hub chat controlling devices that include a computer', () => {
  it('reaches a room holding a light and the hub computer from an owner chat on another machine', async () => {
    boundary(hubMachine);
    const office = rig.opened.store.rooms.create('Office', 0);
    const [light] = rig.opened.store.devices.upsert([
      {
        provider: 'tuya',
        externalId: 'lamp-1',
        parentId: null,
        kind: 'light',
        name: 'Lamp',
        model: 'l1',
        manufacturer: 'Tuya',
        providerRoom: null,
        roomId: office.id,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    rig.opened.store.devices.update(hubMachine, { room_id: office.id });
    const reached: string[] = [];
    const tools = hubTools(controlDevices(reached));
    const session = deskSession();
    const result = await tools.call(session, 'device_control', {
      rooms: [office.id],
      capability: 'power',
      value: false,
    });
    expect(result.response).toStrictEqual({ ok: true });
    expect(reached.toSorted()).toStrictEqual([hubMachine, light?.id ?? ''].toSorted());
  });

  it('admits a tool call from a hub conversation through the boundary once', () => {
    boundary(hubMachine);
    const refusal = vi.spyOn(HubLocalBoundary.prototype, 'refusal');
    hubTools(controlDevices([])).authorizeCall(deskSession(), 'device_control', {});
    expect(refusal).toHaveBeenCalledTimes(1);
  });

  it('does not run the boundary for work that did not start in a hub conversation', async () => {
    boundary(hubMachine);
    const refusal = vi.spyOn(HubLocalBoundary.prototype, 'refusal');
    const hub = new ToolHub([controlDevices([])], toolAdmission(rig.opened.store));
    const result = await hub.call(
      'device_control',
      {},
      {
        authority: { ...hubChat(), hub_os_ban: false },
        profileId: rig.owner.profileId,
        role: 'owner',
        chatId: null,
        via: 'chat',
        clientId: rig.clientId,
      },
    );
    expect(result.response).toStrictEqual({ ok: true });
    expect(refusal).not.toHaveBeenCalled();
  });
});

describe('the hub-local native bridge', () => {
  it('is refused for hub conversations and hidden from their tool list', () => {
    const subject = boundary();
    expect(reachesNativeBridge('claude_read')).toBe(true);
    expect(subject.refusal('claude_read', { view: 'status' })).toMatch(/native desktop session/);
    expect(
      subject.refusal('operation_call', { operation: 'readClaudeStatus', arguments: {} }),
    ).toMatch(/native desktop session/);
  });

  it('leaves Claude CLI tools on other computers available', () => {
    const subject = boundary();
    expect(reachesNativeBridge('read_claude_cli')).toBe(false);
    expect(reachesNativeBridge('claude_start')).toBe(false);
    expect(subject.refusal('read_claude_cli', { view: 'sessions', deviceId: desk })).toBe(
      undefined,
    );
  });
});

describe('starting native work from a hub chat', () => {
  it('names the problem as a forbidden error when it targets the hub machine', () => {
    const subject = boundary(desk);
    const create = {
      operation: 'createAiChat',
      arguments: { body: { engine: { kind: 'claude', device_id: desk } } },
    };
    expect(() =>
      withExecutionAuthority(hubChat(), () => subject.refusal('operation_call', create)),
    ).toThrow(/pick another computer/);
  });

  it('allows another computer', () => {
    const subject = boundary(hubMachine);
    const create = {
      operation: 'createAiChat',
      arguments: { body: { engine: { kind: 'claude', device_id: desk } } },
    };
    expect(withExecutionAuthority(hubChat(), () => subject.refusal('operation_call', create))).toBe(
      undefined,
    );
  });
});
