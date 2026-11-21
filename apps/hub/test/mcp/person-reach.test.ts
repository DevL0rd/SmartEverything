import {
  MCP_TOOLS,
  TEMPLATE_SCOPES,
  createClientToken,
  hashClientToken,
  type AccessScopes,
  type McpToolArea,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  areaRefusal,
  deviceScopeOfActor,
  reachableAreas,
} from '../../src/extensions/mcp/tools/person-reach';
import { foundDevices, listedDevices } from '../../src/extensions/mcp/tools/devices';
import { eventsOf } from '../../src/extensions/mcp/tools/history';
import type { ToolActor, ToolContext } from '../../src/extensions/mcp/tools/registry';
import { placedDevice, placedDevices, targeted } from '../../src/extensions/mcp/tools/targets';
import { toolInScope } from '../../src/extensions/mcp/tools/visibility';
import type { PhoneViewer } from '../../src/phones/phone-detail';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { furnishHome, type ToolHome } from '../support/tool-home';

let opened: TestStore;
let home: ToolHome;
let profileId: string;

const OWNER: PhoneViewer = { role: 'owner', profileId: null };

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  home = furnishHome(opened.store);
  const profile = opened.store.profiles.create({ name: 'Kid' });
  profileId = profile.id;
  opened.store.clients.create({
    name: 'Kid phone',
    platform: 'android',
    role: 'member',
    tokenHash: hashClientToken(createClientToken()),
    profileId,
  });
});

afterEach(async () => {
  await opened.close();
});

async function limit(scopes: Partial<AccessScopes>): Promise<void> {
  opened.store.personAccess.change(profileId, {
    role: 'member',
    template: 'child',
    scopes: { ...TEMPLATE_SCOPES.adult, ...scopes },
  });
  await opened.store.live.access.settled();
}

function member(): Pick<ToolContext, 'store' | 'actor' | 'caller'> {
  const actor: ToolActor = { clientId: null, profileId, role: 'member', chatId: null };
  return { store: opened.store, actor, caller: null };
}

function areaOf(tool: string): McpToolArea {
  const text = MCP_TOOLS.find((candidate) => candidate.name === tool);
  if (text === undefined) throw new Error(`${tool} is a tool`);
  return text.area;
}

describe('the areas the AI of a person reaches', () => {
  it('hides the tools of a missing area from a member AI and keeps them for an owner AI', async () => {
    const area = areaOf('device_find');
    await limit({ areas: TEMPLATE_SCOPES.adult.areas.filter((one) => one !== area) });
    expect(toolInScope(member(), 'device_find')).toBe(false);
    expect(toolInScope(member(), 'home_read')).toBe(areaOf('home_read') !== area);
    const ownerActor: ToolActor = { clientId: null, profileId, role: 'owner', chatId: null };
    expect(
      toolInScope({ store: opened.store, actor: ownerActor, caller: null }, 'device_find'),
    ).toBe(true);
    expect(toolInScope({ store: opened.store, actor: null, caller: null }, 'device_find')).toBe(
      true,
    );
  });

  it('cuts a grant to the areas the person also holds and says whose limit it was', async () => {
    await limit({ areas: ['home', 'devices'] });
    const context = {
      ...member(),
      caller: {
        kind: 'accepted',
        via: 'personal',
        id: 'token',
        localOnly: false,
        readOnly: false,
        areas: ['devices', 'health'],
      },
    } satisfies Pick<ToolContext, 'store' | 'actor' | 'caller'>;
    expect(reachableAreas(context)).toStrictEqual(['devices']);
    expect(areaRefusal(context, 'automation_read', 'automations').message).toContain(
      'personal token',
    );
    expect(areaRefusal(context, 'health_read', 'health').message).toContain(
      'Health is not part of your access',
    );
    expect(areaRefusal(member(), 'settings_edit', 'settings').message).toContain(
      'Settings is not part of your access',
    );
  });

  it('gives a person the areas their scopes name and none when the row cannot be read', async () => {
    await limit({ areas: ['home'] });
    expect(reachableAreas(member())).toStrictEqual(['home']);
    opened.store.personAccess.change(profileId, { scopes: TEMPLATE_SCOPES.child });
    await opened.store.live.access.settled();
    expect(reachableAreas(member())).toStrictEqual(TEMPLATE_SCOPES.child.areas);
  });
});

describe('the devices the AI of a person sees and targets', () => {
  it('lists, finds and places only the devices in scope and refuses a hidden one by id', async () => {
    await limit({ devices: { mode: 'only', rooms: [], devices: [home.lamp.id] } });
    const scope = deviceScopeOfActor(member());
    expect(scope).not.toBeNull();
    expect(
      (await placedDevices(opened.store, scope)).map((placed) => placed.device.id),
    ).toStrictEqual([home.lamp.id]);
    expect(
      (
        await listedDevices(opened.store, scope, {
          includeHidden: true,
          limit: 50,
        })
      ).map((row) => row['id']),
    ).toStrictEqual([home.lamp.id]);
    expect(
      await foundDevices(opened.store, scope, OWNER, {
        includeHidden: true,
        limit: 50,
        detail: false,
      }),
    ).toHaveLength(1);
    await expect(placedDevice(opened.store, scope, home.camera.id)).rejects.toThrow(
      /not part of your access/,
    );
    await expect(targeted(opened.store, scope, { rooms: ['Hall'] })).rejects.toThrow(
      /No device matches/,
    );
    expect(await targeted(opened.store, scope, { rooms: ['Study'] })).toHaveLength(1);
  });

  it('shows events and device groups only for devices in scope', async () => {
    opened.store.events.insert([
      {
        deviceId: home.camera.id,
        kind: 'motion',
        occurredAt: '2026-10-08T09:00:00.000Z',
        details: {},
      },
    ]);
    opened.store.deviceGroups.create({ name: 'Both', device_ids: [home.lamp.id, home.camera.id] });
    opened.store.deviceGroups.create({ name: 'Lamp', device_ids: [home.lamp.id] });
    await limit({ devices: { mode: 'except', rooms: [home.hall.id], devices: [] } });
    const scope = deviceScopeOfActor(member());
    expect(await eventsOf(opened.store, scope, OWNER, { limit: 50 })).toStrictEqual([]);
    expect(await eventsOf(opened.store, null, OWNER, { limit: 50 })).toHaveLength(1);
    expect(
      (await opened.store.host.read('mcpDeviceGroupSummaries', scope))
        .filter((summary) => summary.kind === 'group')
        .map((summary) => summary.name),
    ).toStrictEqual(['Lamp']);
  });
});
