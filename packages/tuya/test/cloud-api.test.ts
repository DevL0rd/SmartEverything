import { describe, expect, it } from 'vitest';
import { CLOUD_DEVICE, STATUS_BATCH_SIZE, commandsOf } from '../src';

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

  it('asks for twenty device statuses at a time', () => {
    expect(STATUS_BATCH_SIZE).toBe(20);
  });

  it('writes commands as code and value pairs only', () => {
    const write = { code: 'switch_1', value: true, dpId: 1 };
    expect(commandsOf([write])).toStrictEqual({ commands: [{ code: 'switch_1', value: true }] });
  });
});
