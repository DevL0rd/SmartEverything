import { describe, expect, it } from 'vitest';
import {
  CLOUD_DEVICE,
  CLOUD_PATHS,
  COMMAND_ACCEPTED,
  DEVICE_PAGE,
  DEVICE_PAGE_SIZE,
  DEVICE_STATUSES,
  HOMES,
  IR_LEARNED,
  IR_REMOTES,
  IR_REMOTE_KEYS,
  ROOMS,
  ROOM_DEVICES,
  SPECIFICATION,
  STATUS_BATCH_SIZE,
  commandBody,
  deviceListQuery,
} from '../src';

const plug = {
  id: 'bf01',
  name: 'Desk plug',
  category: 'cz',
  product_id: 'p1',
  product_name: 'Plug',
  model: '',
  local_key: 'abcdefghijklmnop',
  sub: false,
  online: true,
  gateway_id: '',
  ip: '1.2.3.4',
};

describe('cloud API shapes', () => {
  it('reads a device, treating empty and missing optional text as absent', () => {
    expect(CLOUD_DEVICE.parse(plug)).toStrictEqual({
      id: 'bf01',
      name: 'Desk plug',
      category: 'cz',
      product_id: 'p1',
      product_name: 'Plug',
      model: null,
      local_key: 'abcdefghijklmnop',
      sub: false,
      online: true,
      gateway_id: null,
      node_id: null,
    });
    expect(CLOUD_DEVICE.parse({ ...plug, node_id: null, model: 'X1' })).toMatchObject({
      node_id: null,
      model: 'X1',
    });
  });

  it('reads a device page with or without a cursor', () => {
    expect(
      DEVICE_PAGE.parse({ list: [plug], has_more: true, last_row_key: 'k' }).last_row_key,
    ).toBe('k');
    expect(DEVICE_PAGE.parse({ list: [], has_more: false }).last_row_key).toBeNull();
  });

  it('reads a specification and treats a missing list as empty', () => {
    const item = { code: 'switch_1', dp_id: 1, type: 'Boolean', values: '{}' };
    expect(SPECIFICATION.parse({ category: 'cz', functions: [item] })).toStrictEqual({
      functions: [{ ...item, name: null }],
      status: [],
    });
    expect(SPECIFICATION.parse({ status: [item] }).functions).toStrictEqual([]);
    expect(SPECIFICATION.safeParse({ status: [{ ...item, dp_id: -1 }] }).success).toBe(false);
  });

  it('reads statuses, homes, rooms and room devices', () => {
    expect(
      DEVICE_STATUSES.parse([{ id: 'abc', status: [{ code: 'switch_1', value: true }] }]),
    ).toStrictEqual([{ id: 'abc', status: [{ code: 'switch_1', value: true }] }]);
    expect(HOMES.parse([{ home_id: 12, name: 'Home' }])).toStrictEqual([
      { home_id: '12', name: 'Home' },
    ]);
    expect(ROOMS.parse({ rooms: [{ room_id: 'r1', name: 'Kitchen' }] })).toStrictEqual({
      rooms: [{ room_id: 'r1', name: 'Kitchen' }],
    });
    expect(ROOMS.parse({})).toStrictEqual({ rooms: [] });
    expect(ROOM_DEVICES.parse([{ id: 'abc', name: 'x' }])).toStrictEqual([{ id: 'abc' }]);
    expect(COMMAND_ACCEPTED.safeParse(false).success).toBe(false);
  });

  it('reads infrared remotes, keys and learned codes', () => {
    expect(
      IR_REMOTES.parse([
        { remote_id: 'remote', remote_name: 'TV', category_id: 2, brand_name: 'Acme' },
      ]),
    ).toStrictEqual([
      { remote_id: 'remote', remote_name: 'TV', category_id: 2, brand_name: 'Acme' },
    ]);
    expect(
      IR_REMOTE_KEYS.parse({
        category_id: 2,
        key_list: [{ key: 'power', key_id: 1, key_name: 'Power' }],
      }),
    ).toStrictEqual({ category_id: 2, key_list: [{ key: 'power', key_id: 1, key_name: 'Power' }] });
    expect(IR_LEARNED.parse({ success: true, code: 'c422' })).toStrictEqual({
      success: true,
      code: 'c422',
    });
  });

  it('builds every API path', () => {
    expect(CLOUD_PATHS.devices).toBe('/v1.3/iot-03/devices');
    expect(CLOUD_PATHS.specification('d')).toBe('/v1.1/devices/d/specifications');
    expect(CLOUD_PATHS.statuses).toBe('/v1.0/iot-03/devices/status');
    expect(CLOUD_PATHS.commands('d')).toBe('/v1.0/iot-03/devices/d/commands');
    expect(CLOUD_PATHS.homes('u')).toBe('/v1.0/users/u/homes');
    expect(CLOUD_PATHS.rooms('h')).toBe('/v1.0/homes/h/rooms');
    expect(CLOUD_PATHS.roomDevices('h', 'r')).toBe('/v1.0/homes/h/rooms/r/devices');
    expect(CLOUD_PATHS.irRemotes('b')).toBe('/v2.0/infrareds/b/remotes');
    expect(CLOUD_PATHS.irKeys('b', 'r')).toBe('/v2.0/infrareds/b/remotes/r/keys');
    expect(CLOUD_PATHS.irKeyCommand('b', 'r')).toBe('/v2.0/infrareds/b/remotes/r/raw/command');
    expect(CLOUD_PATHS.irLearningState('b')).toBe('/v2.0/infrareds/b/learning-state');
    expect(CLOUD_PATHS.irLearningCodes('b')).toBe('/v2.0/infrareds/b/learning-codes');
  });

  it('lists the app user devices a page at a time', () => {
    expect(DEVICE_PAGE_SIZE).toBe(100);
    expect(deviceListQuery('u1', null)).toStrictEqual({
      source_type: 'tuyaUser',
      source_id: 'u1',
      page_size: '100',
    });
    expect(deviceListQuery('u1', 'next')).toStrictEqual({
      source_type: 'tuyaUser',
      source_id: 'u1',
      page_size: '100',
      last_row_key: 'next',
    });
  });

  it('asks for twenty device statuses at a time', () => {
    expect(STATUS_BATCH_SIZE).toBe(20);
  });

  it('writes commands as code and value pairs only', () => {
    const write = { code: 'switch_1', value: true, dpId: 1 };
    expect(commandBody([write])).toBe('{"commands":[{"code":"switch_1","value":true}]}');
  });
});
