import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAMERA_EVENT_HOST,
  CAMERA_EVENT_PATH,
  DEVICE_LIST_PATH,
  HOME_LIST_PATH,
  MIOT_SPEC,
  callEventName,
  cameraEventDetections,
  cameraEventListData,
  cameraFeatures,
  chooseTransport,
  deviceEventFromMiot,
  deviceListData,
  go2rtcSource,
  homeListData,
  isCameraModel,
  miotEventKind,
  parseCameraEventPage,
  parseDeviceList,
  parseRoomNames,
  type CloudDevice,
  type MiotSpec,
} from '../src';

function fixture(name: string): MiotSpec {
  return MIOT_SPEC.parse(
    JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8')),
  );
}

const observed = { externalId: '42', occurredAt: '2026-10-08T10:00:00.000Z', details: { a: 1 } };

describe('MIoT events', () => {
  it('map call, doorbell, person, motion and sound events onto event kinds', () => {
    const kinds = {
      'key-call-start': 'call',
      'phone-call-start': 'call',
      'doorbell-ring': 'doorbell',
      'someone-at-the-door': 'person',
      'someone-appeared': 'person',
      'motion-detected': 'motion',
      'object-motion': 'motion',
      'abnormal-sound': 'sound',
      'louder-sound': 'sound',
      'detected-babycry-event': 'sound',
    } as const;
    for (const [name, kind] of Object.entries(kinds)) {
      expect(miotEventKind(name)).toBe(kind);
    }
    expect(miotEventKind('ir-turned-on')).toBe('activity');
    expect(miotEventKind('someone-move')).toBe('motion');
    expect(miotEventKind('nobody-move')).toBe('no_motion');
    expect(miotEventKind('auto-fragrance')).toBe('activity');
    expect(miotEventKind('auto-light')).toBe('activity');
    expect(miotEventKind('click')).toBe('button');
    expect(miotEventKind('low-battery')).toBe('maintenance');
    expect(deviceEventFromMiot('double-click', observed)?.details).toMatchObject({
      action: 'double_press',
      miotEvent: 'double-click',
    });
    expect(deviceEventFromMiot('low-battery', observed)?.details).toMatchObject({
      item: 'battery',
      state: 'low',
    });
    expect(miotEventKind('door-opened')).toBe('opened');
    expect(miotEventKind('camera-hang-up')).toBeNull();
  });

  it('become device events carrying the MIoT event name', () => {
    expect(deviceEventFromMiot('key-call-start', observed)).toStrictEqual({
      externalId: '42',
      occurredAt: '2026-10-08T10:00:00.000Z',
      kind: 'call',
      details: { a: 1, miotEvent: 'key-call-start', detection: 'call' },
    });
    expect(deviceEventFromMiot('cruise-ended', observed)).toStrictEqual({
      externalId: '42',
      occurredAt: '2026-10-08T10:00:00.000Z',
      kind: 'activity',
      details: { a: 1, miotEvent: 'cruise-ended' },
    });
    expect(deviceEventFromMiot('camera-hang-up', observed)).toBeNull();
  });

  it('turn the washer events into laundry cycle and dispenser events', () => {
    const shared = { externalId: '42', occurredAt: '2026-10-08T10:00:00.000Z' };
    expect(deviceEventFromMiot('wash-end', observed)).toStrictEqual({
      ...shared,
      kind: 'cycle_finished',
      details: { a: 1, family: 'laundry', miotEvent: 'wash-end' },
    });
    expect(deviceEventFromMiot('wash-end-log', observed)?.kind).toBe('cycle_finished');
    expect(deviceEventFromMiot('clean-completed', observed)).toStrictEqual({
      ...shared,
      kind: 'maintenance',
      details: {
        a: 1,
        item: 'dispenser',
        state: 'cleaned',
        family: 'laundry',
        miotEvent: 'clean-completed',
      },
    });
  });

  it('are derived only from key-call status changes into calling', () => {
    expect(callEventName(undefined, 1)).toBe('key-call-start');
    expect(callEventName(0, 1)).toBe('key-call-start');
    expect(callEventName(2, 1)).toBe('key-call-start');
    expect(callEventName(1, 1)).toBeNull();
    expect(callEventName(1, 0)).toBeNull();
    expect(callEventName(2, 0)).toBeNull();
    expect(callEventName(1, 2)).toBeNull();
    expect(callEventName(0, 0)).toBeNull();
    expect(callEventName(undefined, 0)).toBeNull();
    expect(callEventName(0, 2)).toBeNull();
  });
});

describe('the camera event list', () => {
  it('is requested from the smart camera host with the community clients parameters', () => {
    expect(CAMERA_EVENT_HOST).toBe('business.smartcamera.api.io.mi.com');
    expect(CAMERA_EVENT_PATH).toBe('/common/app/get/eventlist');
    expect(
      JSON.parse(
        cameraEventListData({
          did: '1',
          model: 'm',
          region: 'de',
          doorbell: true,
          beginTime: 10,
          endTime: 20,
          limit: 5,
        }),
      ),
    ).toStrictEqual({
      did: '1',
      model: 'm',
      doorBell: true,
      eventType: 'Default',
      needMerge: true,
      sortType: 'DESC',
      region: 'DE',
      language: 'en_US',
      beginTime: 10,
      endTime: 20,
      limit: 5,
    });
  });

  it('parses play units and counts the malformed ones', () => {
    expect(
      parseCameraEventPage({
        thirdPartPlayUnits: [
          { createTime: 5, eventType: 'PeopleMotion', fileId: 'f', isAlarm: true, imgStoreId: 'i' },
          { createTime: 'x' },
        ],
      }),
    ).toStrictEqual({
      events: [
        { createTime: 5, eventType: 'PeopleMotion', fileId: 'f', isAlarm: true, imgStoreId: 'i' },
      ],
      malformed: 1,
    });
    expect(parseCameraEventPage({})).toStrictEqual({ events: [], malformed: 0 });
    expect(parseCameraEventPage('x')).toStrictEqual({ events: [], malformed: 1 });
  });

  it('turns event types into detections and reports what it does not know', () => {
    expect(cameraEventDetections('ObjectMotion:PeopleMotion')).toStrictEqual({
      detections: ['motion', 'person'],
      unrecognized: [],
    });
    expect(cameraEventDetections('Doorbell::KeyCall:Face:BabyCry:Pet:Default')).toStrictEqual({
      detections: ['doorbell', 'call', 'person', 'baby_cry', 'pet'],
      unrecognized: ['Default'],
    });
    expect(cameraEventDetections('Ring:human:LouderSound')).toStrictEqual({
      detections: ['doorbell', 'person', 'loud_sound'],
      unrecognized: [],
    });
  });
});

describe('the device list', () => {
  it('is requested with the community clients parameters', () => {
    expect(DEVICE_LIST_PATH).toBe('/home/device_list');
    expect(HOME_LIST_PATH).toBe('/v2/homeroom/gethome');
    expect(deviceListData()).toStrictEqual({
      getVirtualModel: true,
      getHuamiDevices: 1,
      get_split_device: false,
      support_smart_home: true,
    });
    expect(homeListData()).toStrictEqual({
      fg: true,
      fetch_share: true,
      fetch_share_dev: true,
      limit: 300,
      app_ver: 7,
    });
  });

  it('normalises devices and counts the malformed ones', () => {
    expect(
      parseDeviceList({
        list: [
          {
            did: 123,
            name: 'Purifier',
            model: 'zhimi.airp.mb5',
            token: 'ab',
            localip: '10.0.0.2',
            mac: 'AA:BB:CC:DD:EE:FF',
            parent_id: '',
            isOnline: true,
            spec_type: 'urn:x',
          },
          { did: 'blt.3.abc', name: 'Sensor', model: 'm', isOnline: false, localip: ' ' },
          { did: 'x' },
        ],
      }),
    ).toStrictEqual({
      devices: [
        {
          did: '123',
          name: 'Purifier',
          model: 'zhimi.airp.mb5',
          token: 'ab',
          ip: '10.0.0.2',
          mac: 'AA:BB:CC:DD:EE:FF',
          parentDid: null,
          online: true,
          specType: 'urn:x',
        },
        {
          did: 'blt.3.abc',
          name: 'Sensor',
          model: 'm',
          token: null,
          ip: null,
          mac: null,
          parentDid: null,
          online: false,
          specType: null,
        },
      ],
      malformed: 1,
    });
    expect(parseDeviceList(null)).toStrictEqual({ devices: [], malformed: 1 });
  });

  it('knows the room of every device in every home', () => {
    const rooms = parseRoomNames({
      homelist: [
        { name: 'Home', roomlist: [{ name: 'Kitchen', dids: ['1', 2] }] },
        { name: 'Cabin', roomlist: [{ name: 'Porch', dids: ['3'] }] },
        { name: 'Empty' },
        { name: 'Bare', roomlist: [{ name: 'Attic' }] },
      ],
    });
    expect([...rooms.entries()]).toStrictEqual([
      ['1', 'Kitchen'],
      ['2', 'Kitchen'],
      ['3', 'Porch'],
    ]);
    expect(parseRoomNames({}).size).toBe(0);
    expect(parseRoomNames('x').size).toBe(0);
  });
});

describe('transport choice', () => {
  const lan: CloudDevice = {
    did: '4294967295',
    name: 'n',
    model: 'm',
    token: '00112233445566778899aabbccddeeff',
    ip: '10.0.0.2',
    mac: null,
    parentDid: null,
    online: true,
    specType: null,
  };

  it('uses the LAN for a device with a numeric id, an address and a token', () => {
    expect(chooseTransport(lan)).toStrictEqual({
      transport: 'lan',
      reason: 'it has a LAN token and the address 10.0.0.2',
    });
  });

  it('uses the LAN for private and loopback addresses and the cloud for public ones', () => {
    for (const ip of [
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.1',
      '192.168.1.9',
      '169.254.3.4',
      '127.0.0.2',
    ]) {
      expect(chooseTransport({ ...lan, ip }).transport).toBe('lan');
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '192.169.0.1', '300.1.1.1', 'host']) {
      expect(chooseTransport({ ...lan, ip })).toStrictEqual({
        transport: 'cloud',
        reason: `its reported address ${ip} is not a private IPv4 LAN address`,
      });
    }
  });

  it('uses the cloud otherwise and says why', () => {
    expect(chooseTransport({ ...lan, parentDid: '9' })).toStrictEqual({
      transport: 'cloud',
      reason: 'it is reached through its gateway 9',
    });
    for (const did of ['blt.3.x', '4294967296', '12a', '12 ', ' 12']) {
      expect(chooseTransport({ ...lan, did })).toStrictEqual({
        transport: 'cloud',
        reason: 'its id is not a miIO device id (Bluetooth or virtual device)',
      });
    }
    expect(chooseTransport({ ...lan, ip: null })).toStrictEqual({
      transport: 'cloud',
      reason: 'the cloud reports no LAN address for it',
    });
    for (const token of [
      null,
      'abc',
      '0'.repeat(32),
      `x${'0'.repeat(31)}`,
      `${'1'.repeat(32)}0`,
      `0${'1'.repeat(32)}`,
    ]) {
      expect(chooseTransport({ ...lan, token })).toStrictEqual({
        transport: 'cloud',
        reason: 'the cloud holds no usable LAN token for it',
      });
    }
    expect(chooseTransport({ ...lan, token: `${'0'.repeat(31)}1` }).transport).toBe('lan');
    expect(chooseTransport({ ...lan, token: `${'1'.repeat(31)}0` }).transport).toBe('lan');
    expect(chooseTransport({ ...lan, token: 'ABCDEF'.padEnd(32, 'a') }).transport).toBe('lan');
  });
});

describe('cameras', () => {
  it('are recognised by model as go2rtc does', () => {
    expect(isCameraModel('isa.camera.hlc7')).toBe(true);
    expect(isCameraModel('isa.cateye.hldb6')).toBe(true);
    expect(isCameraModel('xiaomi.feeder.pi2001')).toBe(true);
    expect(isCameraModel('zhimi.airp.mb5')).toBe(false);
    expect(isCameraModel('isa.cameras.x')).toBe(false);
  });

  it('stream from the go2rtc xiaomi source URL', () => {
    expect(
      go2rtcSource({
        userId: '1234567890',
        region: 'cn',
        ip: '192.168.1.123',
        did: '9876543210',
        model: 'isa.camera.hlc7',
      }),
    ).toBe('xiaomi://1234567890:cn@192.168.1.123?did=9876543210&model=isa.camera.hlc7');
    expect(go2rtcSource({ userId: 'a b', region: 'de', ip: 'h', did: 'd&x', model: 'm' })).toBe(
      'xiaomi://a%20b:de@h?did=d%26x&model=m',
    );
  });

  it('read talk, pan and tilt and doorbell support from the spec', () => {
    expect(cameraFeatures(fixture('xiaomi-091ac1'), 'xiaomi.camera.091ac1')).toStrictEqual({
      twoWayAudio: true,
      physicalPtz: true,
      doorbell: true,
    });
    expect(cameraFeatures(fixture('isa-hldb6'), 'isa.cateye.hldb6')).toStrictEqual({
      twoWayAudio: false,
      physicalPtz: false,
      doorbell: true,
    });
    const doorbell = fixture('isa-hldb6');
    expect(
      cameraFeatures(
        { ...doorbell, type: 'urn:miot-spec-v2:device:doorbell:0000A03B:isa-hldb6:1' },
        'isa.cateye.hldb6',
      ).doorbell,
    ).toBe(true);
    expect(
      cameraFeatures({ ...doorbell, type: 'urn:miot-spec-v2:device:camera:0:x:1' }, 'x').doorbell,
    ).toBe(false);
    const cruiseOnly = {
      ...doorbell,
      services: [
        {
          iid: 9,
          type: 'urn:miot-spec-v2:service:cruise:0:x:1',
          description: '',
          properties: [],
          actions: [],
          events: [],
        },
      ],
    };
    expect(cameraFeatures(cruiseOnly, 'x').physicalPtz).toBe(true);
    const calibrateOnly = {
      ...doorbell,
      services: [
        {
          iid: 2,
          type: 'urn:miot-spec-v2:service:camera-control:0:x:1',
          description: '',
          properties: [],
          actions: [
            {
              iid: 1,
              type: 'urn:miot-spec-v2:action:ptz-calibrate:0:x:1',
              description: '',
              in: [],
              out: [],
            },
          ],
          events: [],
        },
      ],
    };
    expect(cameraFeatures(calibrateOnly, 'x').physicalPtz).toBe(true);
  });
});
