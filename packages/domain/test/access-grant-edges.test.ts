import { describe, expect, it } from 'vitest';
import { TEMPLATE_SCOPES, grantAccess, withdrawAccess, type Grantable } from '../src';

function person(
  scopes: Partial<Grantable['scopes']>,
  budget: Grantable['budget'] = null,
): Grantable {
  return { scopes: { ...TEMPLATE_SCOPES.child, ...scopes }, budget };
}

describe('access grants that need nothing', () => {
  it('leaves a person on the default models alone', () => {
    const access = person({ models: { mode: 'default', ids: [] } });
    expect(grantAccess(access, { kind: 'model', modelId: 'openai/gpt-6' })).toStrictEqual({
      kind: 'unchanged',
    });
  });

  it('leaves a block list alone when the room or device was never blocked', () => {
    const access = person({ devices: { mode: 'except', rooms: ['room-b'], devices: ['lamp'] } });
    expect(grantAccess(access, { kind: 'room', roomId: 'room-a' }).kind).toBe('unchanged');
    expect(grantAccess(access, { kind: 'device', deviceId: 'tv', roomId: 'room-a' }).kind).toBe(
      'unchanged',
    );
    expect(grantAccess(access, { kind: 'device', deviceId: 'tv', roomId: null }).kind).toBe(
      'unchanged',
    );
  });

  it('leaves a room already on the allow list alone', () => {
    const access = person({ devices: { mode: 'only', rooms: ['room-a'], devices: [] } });
    expect(grantAccess(access, { kind: 'room', roomId: 'room-a' }).kind).toBe('unchanged');
  });
});

describe('withdrawing access', () => {
  it('changes nothing for a person who sees every device', () => {
    const access = person({});
    expect(withdrawAccess(access, { kind: 'room', roomId: 'room-a' })).toStrictEqual(access);
    expect(withdrawAccess(access, { kind: 'device', deviceId: 'tv', roomId: null })).toStrictEqual(
      access,
    );
  });

  it('blocks the room again for a person with a block list', () => {
    const access = person({ devices: { mode: 'except', rooms: [], devices: [] } });
    const after = withdrawAccess(access, { kind: 'room', roomId: 'room-a' });
    expect(after.scopes.devices).toStrictEqual({ mode: 'except', rooms: ['room-a'], devices: [] });
  });

  it('takes a model off the limited list and keeps the others', () => {
    const access = person({ models: { mode: 'only', ids: ['a/one', 'b/two'] } });
    const after = withdrawAccess(access, { kind: 'model', modelId: 'a/one' });
    expect(after.scopes.models.ids).toStrictEqual(['b/two']);
  });

  it('has no budget to lower for a person without one', () => {
    const access = person({});
    expect(withdrawAccess(access, { kind: 'budget', usd: 1 })).toStrictEqual(access);
  });
});

describe('withdrawing a room from a block list', () => {
  it('keeps the room blocked once, not twice', () => {
    const access = person({ devices: { mode: 'except', rooms: ['room-a'], devices: [] } });
    const after = withdrawAccess(access, { kind: 'room', roomId: 'room-a' });
    expect(after.scopes.devices).toStrictEqual({ mode: 'except', rooms: ['room-a'], devices: [] });
  });

  it('keeps a device blocked once, not twice', () => {
    const access = person({ devices: { mode: 'except', rooms: [], devices: ['lamp'] } });
    const after = withdrawAccess(access, { kind: 'device', deviceId: 'lamp', roomId: null });
    expect(after.scopes.devices.devices).toStrictEqual(['lamp']);
  });
});
