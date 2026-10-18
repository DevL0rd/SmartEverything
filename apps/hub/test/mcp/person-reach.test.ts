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
import { deviceGroupSummaries } from '../../src/extensions/mcp/tools/device-groups';
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

function limit(scopes: Partial<AccessScopes>): void {
  opened.store.personAccess.change(profileId, {
    role: 'member',
    template: 'child',
    scopes: { ...TEMPLATE_SCOPES.adult, ...scopes },
  });
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
  it('hides the tools of a missing area from a member AI and keeps them for an owner AI', () => {
    const area = areaOf('find_devices');
    limit({ areas: TEMPLATE_SCOPES.adult.areas.filter((one) => one !== area) });
    expect(toolInScope(member(), 'find_devices')).toBe(false);
    expect(toolInScope(member(), 'get_home')).toBe(areaOf('get_home') !== area);
    const ownerActor: ToolActor = { clientId: null, profileId, role: 'owner', chatId: null };
    expect(
      toolInScope({ store: opened.store, actor: ownerActor, caller: null }, 'find_devices'),
    ).toBe(true);
    expect(toolInScope({ store: opened.store, actor: null, caller: null }, 'find_devices')).toBe(
      true,
    );
  });

  it('cuts a grant to the areas the person also holds and says whose limit it was', () => {
    limit({ areas: ['home', 'devices'] });
    const context = {
      ...member(),
      caller: {
        kind: 'accepted',
        via: 'personal',
        id: 'token',
        localOnly: false,
        areas: ['devices', 'health'],
      },
    } satisfies Pick<ToolContext, 'store' | 'actor' | 'caller'>;
    expect(reachableAreas(context)).toStrictEqual(['devices']);
    expect(areaRefusal(context, 'list_automations', 'automations').message).toContain(
      'personal token',
    );
    expect(areaRefusal(context, 'read_health', 'health').message).toContain(
      'Health is not part of your access',
    );
    expect(areaRefusal(member(), 'update_settings', 'settings').message).toContain(
      'Settings is not part of your access',
    );
  });

  it('gives a person the areas their scopes name and none when the row cannot be read', () => {
    limit({ areas: ['home'] });
    expect(reachableAreas(member())).toStrictEqual(['home']);
    opened.store.personAccess.change(profileId, { scopes: TEMPLATE_SCOPES.child });
    expect(reachableAreas(member())).toStrictEqual(TEMPLATE_SCOPES.child.areas);
  });
});

describe('the devices the AI of a person sees and targets', () => {
  it('lists, finds and places only the devices in scope and refuses a hidden one by id', () => {
    limit({ devices: { mode: 'only', rooms: [], devices: [home.lamp.id] } });
    const scope = deviceScopeOfActor(member());
    expect(scope).not.toBeNull();
    expect(placedDevices(opened.store, scope).map((placed) => placed.device.id)).toStrictEqual([
      home.lamp.id,
    ]);
    expect(
      listedDevices(opened.store, scope, {
        includeHidden: true,
        limit: 50,
      }).map((row) => row['id']),
    ).toStrictEqual([home.lamp.id]);
    expect(
      foundDevices(opened.store, scope, OWNER, { includeHidden: true, limit: 50, detail: false }),
    ).toHaveLength(1);
    expect(() => placedDevice(opened.store, scope, home.camera.id)).toThrow(
      /not part of your access/,
    );
    expect(() => targeted(opened.store, scope, { rooms: ['Hall'] })).toThrow(/No device matches/);
    expect(targeted(opened.store, scope, { rooms: ['Study'] })).toHaveLength(1);
  });

  it('shows events and device groups only for devices in scope', () => {
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
    limit({ devices: { mode: 'except', rooms: [home.hall.id], devices: [] } });
    const scope = deviceScopeOfActor(member());
    expect(eventsOf(opened.store, scope, OWNER, { limit: 50 })).toStrictEqual([]);
    expect(eventsOf(opened.store, null, OWNER, { limit: 50 })).toHaveLength(1);
    expect(
      deviceGroupSummaries(opened.store, scope)
        .filter((summary) => summary.kind === 'group')
        .map((summary) => summary.name),
    ).toStrictEqual(['Lamp']);
  });
});
