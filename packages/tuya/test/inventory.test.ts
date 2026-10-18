import { DISCOVERED_DEVICE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  CLOUD_DEVICE,
  IR_REMOTE_KEYS,
  MANUFACTURER,
  RemoteKeyError,
  buildDeviceModel,
  discoveredDevice,
  isSleepingSensor,
  libraryCommandBody,
  libraryKeyOf,
  remoteDevice,
  remoteKeyCapability,
} from '../src';
import { BOOL, int, options, point } from './fixtures';

const gateway = CLOUD_DEVICE.parse({
  id: 'gw1',
  name: 'Hub',
  category: 'wg2',
  product_id: 'pg',
  local_key: 'abcdefghijklmnop',
  sub: false,
  online: true,
});

const sensor = CLOUD_DEVICE.parse({
  id: 'th1',
  name: '  ',
  category: 'wsdcg',
  product_id: 'pt',
  product_name: 'TH sensor',
  model: 'TS0201',
  local_key: 'abcdefghijklmnop',
  sub: true,
  online: false,
  gateway_id: 'gw1',
  node_id: 'a4c1',
});

const sensorModel = buildDeviceModel(
  'wsdcg',
  [
    point('va_temperature', 1, int(-200, 600, 1, '℃'), { writable: false }),
    point('battery_percentage', 4, int(0, 100)),
  ],
  new Set(),
);

const keys = IR_REMOTE_KEYS.parse({
  category_id: 2,
  key_list: [
    { key: 'power', key_id: 1, key_name: 'Power' },
    { key: 'volume_up', key_id: 5 },
    { key: 'power', key_id: 1 },
  ],
});

describe('inventory', () => {
  it('describes a sub-device with its gateway, transport and rejected data points', () => {
    const device = discoveredDevice(
      {
        device: sensor,
        model: sensorModel,
        rejected: [{ code: 'x', reason: 'bad' }],
        specificationPublished: true,
        smartLife: null,
        room: 'Bedroom',
      },
      { transport: 'local', reason: 'via_gateway' },
      null,
    );
    expect(DISCOVERED_DEVICE.parse(device)).toStrictEqual(device);
    expect(device).toStrictEqual({
      provider: 'tuya',
      externalId: 'th1',
      parentExternalId: 'gw1',
      kind: 'sensor',
      name: 'TH sensor',
      model: 'TS0201',
      manufacturer: 'Tuya',
      room: 'Bedroom',
      online: false,
      capabilities: sensorModel.capabilities,
      details: {
        category: 'wsdcg',
        productId: 'pt',
        transport: 'local',
        transportReason: 'via_gateway',
        protocolVersion: null,
        subDevice: true,
        nodeId: 'a4c1',
        specificationPublished: true,
        link: 'developer_project',
        rejectedDataPoints: [{ code: 'x', reason: 'bad' }],
      },
    });
  });

  it('describes a Wi-Fi device by its own name and product', () => {
    const device = discoveredDevice(
      {
        device: gateway,
        model: buildDeviceModel('wg2', [], new Set()),
        rejected: [],
        specificationPublished: false,
        smartLife: null,
        room: null,
      },
      { transport: 'local', reason: 'on_lan' },
      '3.4',
    );
    expect(device).toMatchObject({
      parentExternalId: null,
      name: 'Hub',
      model: 'pg',
      kind: 'gateway',
      details: { protocolVersion: '3.4', specificationPublished: false, nodeId: null },
    });
    expect(MANUFACTURER).toBe('Tuya');
  });

  it('falls back to the device id only when the cloud gives neither name nor product', () => {
    const unnamed = CLOUD_DEVICE.parse({ ...gateway, name: '' });
    expect(
      discoveredDevice(
        {
          device: unnamed,
          model: buildDeviceModel('wg2', [], new Set()),
          rejected: [],
          specificationPublished: true,
          smartLife: null,
          room: null,
        },
        { transport: 'cloud', reason: 'not_on_lan' },
        null,
      ).name,
    ).toBe('gw1');
  });

  it('recognises battery sensors that sleep between reports', () => {
    expect(isSleepingSensor(sensorModel)).toBe(true);
    expect(
      isSleepingSensor(buildDeviceModel('wsdcg', [point('va_temperature', 1, int())], new Set())),
    ).toBe(false);
    expect(
      isSleepingSensor(buildDeviceModel('cz', [point('battery_percentage', 1, int())], new Set())),
    ).toBe(false);
    for (const code of ['battery_state', 'battery_value', 'va_battery']) {
      expect(
        isSleepingSensor(buildDeviceModel('pir', [point(code, 1, options('low'))], new Set())),
      ).toBe(true);
    }
    expect(isSleepingSensor(buildDeviceModel('pir', [point('pir', 1, BOOL)], new Set()))).toBe(
      false,
    );
  });
});

describe('infrared library remotes', () => {
  it('offers each distinct key of a remote as a button', () => {
    expect(remoteKeyCapability(keys)).toStrictEqual({
      key: 'remote_key',
      label: 'Remote button',
      access: 'write',
      value: { kind: 'enum', options: ['power', 'volume_up'] },
    });
    expect(remoteKeyCapability({ category_id: 2, key_list: [] })).toBeNull();
  });

  it('describes a remote as a cloud device under its blaster', () => {
    const device = remoteDevice(
      gateway,
      { remote_id: 'r1', remote_name: 'TV', category_id: 2, brand_name: 'Acme' },
      keys,
      'Lounge',
    );
    expect(DISCOVERED_DEVICE.parse(device)).toStrictEqual(device);
    expect(device).toStrictEqual({
      provider: 'tuya',
      externalId: 'r1',
      parentExternalId: 'gw1',
      kind: 'ir_remote',
      name: 'TV',
      model: 'ir-category-2',
      manufacturer: 'Acme',
      room: 'Lounge',
      online: true,
      capabilities: [remoteKeyCapability(keys)],
      details: { categoryId: 2, transport: 'cloud', transportReason: 'cloud_library' },
    });
    expect(
      remoteDevice(
        gateway,
        { remote_id: 'r2', remote_name: 'Fan', category_id: 8, brand_name: null },
        { category_id: 8, key_list: [] },
        null,
      ),
    ).toMatchObject({ manufacturer: 'Tuya', capabilities: [] });
  });

  it('turns a button into a library key and its cloud command', () => {
    const key = libraryKeyOf('r1', keys, 'volume_up');
    expect(key).toStrictEqual({ remoteId: 'r1', categoryId: 2, keyId: 5, key: 'volume_up' });
    expect(libraryCommandBody(key)).toBe('{"category_id":2,"key_id":5,"key":"volume_up"}');
    expect(() => libraryKeyOf('r1', keys, 'mute')).toThrow(new RemoteKeyError('r1', 'mute'));
    expect(new RemoteKeyError('r1', 'mute')).toMatchObject({
      name: 'RemoteKeyError',
      message: 'The IR remote r1 has no button "mute".',
    });
  });
});
