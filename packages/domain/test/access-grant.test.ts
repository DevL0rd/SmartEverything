import { describe, expect, it } from 'vitest';
import {
  MCP_TOOL_AREAS,
  TEMPLATE_SCOPES,
  grantAccess,
  withdrawAccess,
  type DeviceScope,
  type Grantable,
  type ModelScope,
  type GrantOutcome,
} from '../src';

const BUDGET = { daily_usd: 2, monthly_usd: 20, warn_at_percent: 80, hard_stop: true };

function person(
  scopes: Partial<Grantable['scopes']>,
  budget: Grantable['budget'] = null,
): Grantable {
  return { scopes: { ...TEMPLATE_SCOPES.child, ...scopes }, budget };
}

function changed(outcome: GrantOutcome): Grantable {
  if (outcome.kind !== 'changed') throw new Error(`expected a change, got ${outcome.kind}`);
  return outcome.access;
}

describe('granting an area', () => {
  it('adds a missing area and keeps the order of the areas', () => {
    const after = changed(grantAccess(person({}), { kind: 'area', area: 'settings' }));
    expect(after.scopes.areas).toContain('settings');
    expect(after.scopes.areas).toStrictEqual(
      MCP_TOOL_AREAS.filter((area) => after.scopes.areas.includes(area)),
    );
  });

  it('changes nothing for an area they hold, and takes it back on withdrawal', () => {
    expect(grantAccess(person({}), { kind: 'area', area: 'home' }).kind).toBe('unchanged');
    const given = changed(grantAccess(person({}), { kind: 'area', area: 'settings' }));
    expect(withdrawAccess(given, { kind: 'area', area: 'settings' })).toStrictEqual(person({}));
  });
});

describe('granting devices and rooms', () => {
  const only: DeviceScope = { mode: 'only', rooms: ['room-a'], devices: ['lamp'] };
  const except: DeviceScope = { mode: 'except', rooms: ['room-b'], devices: ['lamp'] };

  it('does nothing when every device is already visible', () => {
    const all = person({});
    expect(grantAccess(all, { kind: 'device', deviceId: 'tv', roomId: null }).kind).toBe(
      'unchanged',
    );
    expect(grantAccess(all, { kind: 'room', roomId: 'room-a' }).kind).toBe('unchanged');
  });

  it('adds a device to an allow list unless its room is already allowed', () => {
    const grant = { kind: 'device', deviceId: 'tv', roomId: 'room-c' } as const;
    const after = changed(grantAccess(person({ devices: only }), grant));
    expect(after.scopes.devices.devices).toStrictEqual(['lamp', 'tv']);
    expect(grantAccess(person({ devices: only }), { ...grant, roomId: 'room-a' }).kind).toBe(
      'unchanged',
    );
    expect(withdrawAccess(after, grant)).toStrictEqual(person({ devices: only }));
  });

  it('removes a device from a block list and puts it back on withdrawal', () => {
    const grant = { kind: 'device', deviceId: 'lamp', roomId: 'room-c' } as const;
    const after = changed(grantAccess(person({ devices: except }), grant));
    expect(after.scopes.devices.devices).toStrictEqual([]);
    expect(withdrawAccess(after, grant).scopes.devices.devices).toStrictEqual(['lamp']);
  });

  it('refuses one device of a blocked room and says to grant the room', () => {
    const outcome = grantAccess(person({ devices: except }), {
      kind: 'device',
      deviceId: 'tv',
      roomId: 'room-b',
    });
    expect(outcome).toMatchObject({ kind: 'refused' });
    const room = changed(
      grantAccess(person({ devices: except }), { kind: 'room', roomId: 'room-b' }),
    );
    expect(room.scopes.devices.rooms).toStrictEqual([]);
    expect(
      withdrawAccess(room, { kind: 'room', roomId: 'room-b' }).scopes.devices.rooms,
    ).toStrictEqual(['room-b']);
  });

  it('adds a room to an allow list and removes it on withdrawal', () => {
    const grant = { kind: 'room', roomId: 'room-z' } as const;
    const after = changed(grantAccess(person({ devices: only }), grant));
    expect(after.scopes.devices.rooms).toStrictEqual(['room-a', 'room-z']);
    expect(withdrawAccess(after, grant)).toStrictEqual(person({ devices: only }));
  });
});

describe('granting a model', () => {
  const only: ModelScope = { mode: 'only', ids: ['google/gemini-3.8-flash'] };

  it('adds a model to a limited list and removes it again', () => {
    const grant = { kind: 'model', modelId: 'openai/gpt-6' } as const;
    const after = changed(grantAccess(person({ models: only }), grant));
    expect(after.scopes.models.ids).toStrictEqual(['google/gemini-3.8-flash', 'openai/gpt-6']);
    expect(withdrawAccess(after, grant)).toStrictEqual(person({ models: only }));
  });

  it('changes nothing when every model is allowed or the model is listed', () => {
    const grant = { kind: 'model', modelId: 'google/gemini-3.8-flash' } as const;
    expect(grantAccess(person({}), grant).kind).toBe('unchanged');
    expect(grantAccess(person({ models: only }), grant).kind).toBe('unchanged');
  });
});

describe('granting more AI budget', () => {
  it('raises the daily and monthly limits that exist and lowers them on withdrawal', () => {
    const grant = { kind: 'budget', usd: 3.5 } as const;
    const after = changed(grantAccess(person({}, BUDGET), grant));
    expect(after.budget).toMatchObject({ daily_usd: 5.5, monthly_usd: 23.5 });
    expect(withdrawAccess(after, grant).budget).toMatchObject({ daily_usd: 2, monthly_usd: 20 });
  });

  it('leaves a missing limit missing', () => {
    const after = changed(
      grantAccess(person({}, { ...BUDGET, monthly_usd: null }), { kind: 'budget', usd: 1 }),
    );
    expect(after.budget).toMatchObject({ daily_usd: 3, monthly_usd: null });
  });

  it('refuses when there is no limit to raise', () => {
    expect(grantAccess(person({}), { kind: 'budget', usd: 1 }).kind).toBe('refused');
    expect(
      grantAccess(person({}, { ...BUDGET, daily_usd: null, monthly_usd: null }), {
        kind: 'budget',
        usd: 1,
      }).kind,
    ).toBe('refused');
  });

  it('never lowers a limit below nothing', () => {
    const grant = { kind: 'budget', usd: 10 } as const;
    expect(withdrawAccess(person({}, BUDGET), grant).budget).toMatchObject({ daily_usd: 0 });
  });
});
