import { describe, expect, it } from 'vitest';
import {
  CLOUD_DEVICE,
  buildDeviceModel,
  discoveredDevice,
  type DataPointConversion,
  type SmartLifeFacts,
} from '../src';

const device = CLOUD_DEVICE.parse({
  id: 'sw1',
  name: 'Plug',
  category: 'cz',
  product_id: 'pp',
  local_key: 'abcdefghijklmnop',
  sub: false,
  online: true,
});

function conversion(name: string, dpId: number): DataPointConversion {
  return {
    name,
    dpId,
    code: `dp_${String(dpId)}`,
    valueType: 'value',
    valueDesc: '{}',
    enumMappings: null,
  };
}

const facts: SmartLifeFacts = {
  conversions: new Map([
    [1, conversion('default', 1)],
    [18, conversion('percentage', 18)],
    [19, conversion('scale_1', 19)],
  ]),
  cloudReports: 'codes',
  cloudReportReason: 'data_point_not_local',
  gatewayFrom: 'device_list',
  nodeIdFrom: null,
};

describe('a device linked through Smart Life', () => {
  it('reports how the cloud reports it and how many data points are converted', () => {
    const described = discoveredDevice(
      {
        device,
        model: buildDeviceModel('cz', [], new Set()),
        rejected: [],
        specificationPublished: true,
        room: null,
        smartLife: facts,
      },
      { transport: 'local', reason: 'on_lan' },
      '3.4',
    );
    expect(described.details).toMatchObject({
      link: 'smart_life',
      cloudReports: 'codes',
      cloudReportReason: 'data_point_not_local',
      gatewayFrom: 'device_list',
      nodeIdFrom: null,
      convertedDataPoints: 2,
    });
  });
});
