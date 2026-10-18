import { CommandRefusedError, DISCOVERED_DEVICE } from '@smarteverything/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { InvalidMacAddressError, SamsungTvMessageError } from '../src/errors';
import {
  TV_APP_NAMES,
  TV_APPS,
  TV_INPUT_SOURCES,
  TV_KEYS,
  tvAppNamed,
} from '../src/samsung-tv/catalogue';
import { resolveTvCommand, TV_CAPABILITIES, tvDevice } from '../src/samsung-tv/device';
import {
  BROADCAST_ADDRESS,
  deviceInfoUrl,
  macBytes,
  magicPacket,
  readDeviceInfo,
  REST_PORT,
  WAKE_ON_LAN_PORT,
} from '../src/samsung-tv/power';
import {
  installedAppsMessage,
  keyMessage,
  LAUNCH_ACTIONS,
  launchActionOf,
  launchMessage,
  readTvMessage,
  REMOTE_PORT,
  TV_CHANNELS,
  remoteUrl,
} from '../src/samsung-tv/remote';

describe('the Samsung TV remote-control protocol', () => {
  it('connects to the remote channel on port 8002 with the app name in base64', () => {
    expect(REMOTE_PORT).toBe(8002);
    expect(TV_CHANNELS).toEqual({
      remote: 'samsung.remote.control',
      art: 'com.samsung.art-app',
    });
    expect(remoteUrl('192.168.1.20', 'remote', 'SmartEverything', null)).toBe(
      'wss://192.168.1.20:8002/api/v2/channels/samsung.remote.control?name=U21hcnRFdmVyeXRoaW5n',
    );
    expect(remoteUrl('tv.local', 'remote', 'Hub?', '12345678')).toBe(
      'wss://tv.local:8002/api/v2/channels/samsung.remote.control?name=SHViPw%3D%3D&token=12345678',
    );
  });

  it('sends keys as clicks', () => {
    expect(JSON.parse(keyMessage('KEY_HOME', 'Click'))).toEqual({
      method: 'ms.remote.control',
      params: {
        Cmd: 'Click',
        DataOfCmd: 'KEY_HOME',
        Option: 'false',
        TypeOfRemote: 'SendRemoteKey',
      },
    });
  });

  it('launches apps as deep links or native launches', () => {
    expect(LAUNCH_ACTIONS).toEqual(['DEEP_LINK', 'NATIVE_LAUNCH']);
    expect(launchActionOf(2)).toBe('DEEP_LINK');
    expect(launchActionOf(4)).toBe('NATIVE_LAUNCH');
    expect(JSON.parse(launchMessage('111299001912', 'DEEP_LINK'))).toEqual({
      method: 'ms.channel.emit',
      params: {
        event: 'ed.apps.launch',
        to: 'host',
        data: { action_type: 'DEEP_LINK', appId: '111299001912', metaTag: '' },
      },
    });
    expect(JSON.parse(installedAppsMessage())).toEqual({
      method: 'ms.channel.emit',
      params: { event: 'ed.installedApp.get', to: 'host' },
    });
  });

  it('reads the token from the connect message', () => {
    expect(
      readTvMessage('{"event":"ms.channel.connect","data":{"token":"12345678","clients":[]}}'),
    ).toEqual({
      kind: 'connected',
      token: '12345678',
    });
    expect(readTvMessage('{"event":"ms.channel.connect","data":{"token":42}}')).toEqual({
      kind: 'connected',
      token: '42',
    });
    expect(readTvMessage('{"event":"ms.channel.connect","data":{"clients":[]}}')).toEqual({
      kind: 'connected',
      token: null,
    });
    expect(readTvMessage('{"event":"ms.channel.connect"}')).toEqual({
      kind: 'connected',
      token: null,
    });
  });

  it('reads refusals, time-outs, errors and installed apps', () => {
    expect(readTvMessage('{"event":"ms.channel.unauthorized"}')).toEqual({ kind: 'unauthorized' });
    expect(readTvMessage('{"event":"ms.channel.timeOut"}')).toEqual({ kind: 'timed_out' });
    expect(readTvMessage('{"event":"ms.error","data":{"message":"unrecognized method"}}')).toEqual({
      kind: 'error',
      message: 'unrecognized method',
    });
    expect(
      readTvMessage(
        JSON.stringify({
          event: 'ed.installedApp.get',
          data: {
            data: [
              { appId: '111299001912', app_type: 2, name: 'YouTube', icon: '/x.png', is_lock: 0 },
            ],
          },
        }),
      ),
    ).toEqual({
      kind: 'installed_apps',
      apps: [{ appId: '111299001912', appType: 2, name: 'YouTube' }],
    });
    expect(readTvMessage('{"event":"ms.channel.clientConnect","data":{}}')).toEqual({
      kind: 'other',
      event: 'ms.channel.clientConnect',
    });
  });

  it('refuses messages it cannot read, naming what was received', () => {
    expect(() => readTvMessage('not json')).toThrow(SamsungTvMessageError);
    expect(() => readTvMessage('not json')).toThrow(
      /^The Samsung TV sent a message that could not be read: SyntaxError/,
    );
    expect(() => readTvMessage('{"data":1}')).toThrow(
      'The Samsung TV sent a message that could not be read: no event name. Received {"data":1}.',
    );
    expect(() => readTvMessage('{"event":"ed.installedApp.get","data":{}}')).toThrow(
      /^The Samsung TV sent a message that could not be read: ed.installedApp.get data: /,
    );
    expect(() => readTvMessage('{"event":"ms.error","data":{}}')).toThrow(/ms.error data/);
  });
});

describe('power and Wake-on-LAN', () => {
  it('asks the REST API on port 8001 for the device information', () => {
    expect(REST_PORT).toBe(8001);
    expect(deviceInfoUrl('192.168.1.20')).toBe('http://192.168.1.20:8001/api/v2/');
  });

  it('reads the power state the TV reports', () => {
    const info = (device: Record<string, unknown>): ReturnType<typeof readDeviceInfo> =>
      readDeviceInfo({ type: 'Samsung SmartTV', device });
    expect(
      info({
        PowerState: 'on',
        modelName: 'QE65S95C',
        name: 'Living room',
        wifiMac: 'a1:b2:c3:d4:e5:f6',
      }),
    ).toEqual({
      on: true,
      powerStateReported: true,
      model: 'QE65S95C',
      frame: false,
      name: 'Living room',
      wifiMac: 'a1:b2:c3:d4:e5:f6',
    });
    expect(info({ PowerState: 'standby' })).toEqual({
      on: false,
      powerStateReported: true,
      model: null,
      frame: false,
      name: null,
      wifiMac: null,
    });
    expect(info({})).toEqual({
      on: true,
      powerStateReported: false,
      model: null,
      frame: false,
      name: null,
      wifiMac: null,
    });
    expect(() => readDeviceInfo({ device: 'x' })).toThrow(
      /^The Samsung TV sent a message that could not be read: device information/,
    );
  });

  it('builds the magic packet: six bytes of ones then the address sixteen times', () => {
    expect(WAKE_ON_LAN_PORT).toBe(9);
    expect(BROADCAST_ADDRESS).toBe('255.255.255.255');
    const packet = magicPacket('a1:b2:c3:d4:e5:f6');
    expect(packet).toHaveLength(102);
    expect([...packet.slice(0, 6)]).toEqual([255, 255, 255, 255, 255, 255]);
    for (let repeat = 1; repeat <= 16; repeat += 1) {
      expect([...packet.slice(repeat * 6, repeat * 6 + 6)]).toEqual([
        0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6,
      ]);
    }
  });

  it('accepts colons or dashes in any case and refuses anything else', () => {
    expect([...macBytes('A1-B2-C3-D4-E5-F6')]).toEqual([0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6]);
    expect(() => macBytes('a1:b2:c3:d4:e5')).toThrow(InvalidMacAddressError);
    expect(() => macBytes('xa1:b2:c3:d4:e5:f6')).toThrow(
      'A MAC address is six pairs of hexadecimal digits separated by colons or dashes. Received "xa1:b2:c3:d4:e5:f6".',
    );
    expect(() => macBytes('a1:b2:c3:d4:e5:f6x')).toThrow(InvalidMacAddressError);
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 6, maxLength: 6 }), (bytes) => {
        const mac = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(':');
        expect([...macBytes(mac)]).toEqual([...bytes]);
      }),
    );
  });
});

describe('the television as a device', () => {
  const identity = {
    host: '192.168.1.20',
    macAddress: 'A1:B2:C3:D4:E5:F6',
    name: 'Living room TV',
    model: 'QE65S95C',
    frame: false,
  };

  it('is a valid television with power, keys, apps and inputs', () => {
    const device = DISCOVERED_DEVICE.parse(tvDevice(identity, true));
    expect(device).toEqual({
      provider: 'samsung_tv',
      externalId: 'a1:b2:c3:d4:e5:f6',
      parentExternalId: null,
      kind: 'television',
      name: 'Living room TV',
      model: 'QE65S95C',
      manufacturer: 'Samsung',
      room: null,
      online: true,
      capabilities: TV_CAPABILITIES,
      details: {
        host: '192.168.1.20',
        macAddress: 'A1:B2:C3:D4:E5:F6',
        powerStatePolling: true,
        frameTv: false,
      },
    });
    expect(tvDevice(identity, false).online).toBe(false);
    expect(
      TV_CAPABILITIES.map((capability) => [
        capability.key,
        capability.label,
        capability.access,
        capability.value.kind,
      ]),
    ).toEqual([
      ['power', 'Power', 'read_write', 'boolean'],
      ['raw:volume_up', 'Volume up', 'write', 'action'],
      ['raw:volume_down', 'Volume down', 'write', 'action'],
      ['raw:mute_toggle', 'Mute or unmute', 'write', 'action'],
      ['remote_key', 'Remote button', 'write', 'enum'],
      ['app_launch', 'Open app', 'write', 'enum'],
      ['input_source', 'Input', 'write', 'enum'],
    ]);
    expect(TV_CAPABILITIES[4]?.value).toEqual({ kind: 'enum', options: [...TV_KEYS] });
    expect(TV_CAPABILITIES[5]?.value).toEqual({ kind: 'enum', options: [...TV_APP_NAMES] });
    expect(TV_CAPABILITIES[6]?.value).toEqual({
      kind: 'enum',
      options: ['tv', 'hdmi1', 'hdmi2', 'hdmi3', 'hdmi4'],
    });
  });

  it('turns commands into power changes, keys and launches', () => {
    expect(resolveTvCommand('power', true, false)).toEqual({ kind: 'power', on: true });
    expect(resolveTvCommand('power', false, false)).toEqual({ kind: 'power', on: false });
    expect(resolveTvCommand('raw:volume_up', null, false)).toEqual({
      kind: 'key',
      key: 'KEY_VOLUP',
    });
    expect(resolveTvCommand('raw:volume_down', null, false)).toEqual({
      kind: 'key',
      key: 'KEY_VOLDOWN',
    });
    expect(resolveTvCommand('raw:mute_toggle', null, false)).toEqual({
      kind: 'key',
      key: 'KEY_MUTE',
    });
    expect(resolveTvCommand('remote_key', 'KEY_HOME', false)).toEqual({
      kind: 'key',
      key: 'KEY_HOME',
    });
    expect(resolveTvCommand('input_source', 'hdmi2', false)).toEqual({
      kind: 'key',
      key: 'KEY_HDMI2',
    });
    expect(resolveTvCommand('app_launch', 'YouTube', false)).toEqual({
      kind: 'launch',
      app: { name: 'YouTube', ids: ['111299001912'] },
    });
  });

  it('refuses what the television cannot do, saying why', () => {
    expect(() => resolveTvCommand('power', 'on', false)).toThrow(
      new CommandRefusedError('power', 'expected true or false'),
    );
    expect(() => resolveTvCommand('remote_key', 'KEY_TELEPORT', false)).toThrow(
      new CommandRefusedError('remote_key', 'not a known remote key'),
    );
    expect(() => resolveTvCommand('input_source', 'hdmi9', false)).toThrow(
      new CommandRefusedError('input_source', 'not a known input'),
    );
    expect(() => resolveTvCommand('app_launch', 'Nonexistent Player', false)).toThrow(
      new CommandRefusedError('app_launch', 'not a known app'),
    );
    expect(() => resolveTvCommand('app_launch', 3, false)).toThrow(
      new CommandRefusedError('app_launch', 'not a known app'),
    );
    expect(() => resolveTvCommand('brightness', 3, false)).toThrow(
      new CommandRefusedError('brightness', 'the television does not have it'),
    );
  });
});

describe('the catalogues', () => {
  it('lists the keys a Samsung remote sends', () => {
    expect(TV_KEYS).toMatchInlineSnapshot(`
      [
        "KEY_POWER",
        "KEY_POWEROFF",
        "KEY_HOME",
        "KEY_MENU",
        "KEY_SOURCE",
        "KEY_GUIDE",
        "KEY_TOOLS",
        "KEY_INFO",
        "KEY_UP",
        "KEY_DOWN",
        "KEY_LEFT",
        "KEY_RIGHT",
        "KEY_ENTER",
        "KEY_RETURN",
        "KEY_CH_LIST",
        "KEY_CHUP",
        "KEY_CHDOWN",
        "KEY_PRECH",
        "KEY_VOLUP",
        "KEY_VOLDOWN",
        "KEY_MUTE",
        "KEY_0",
        "KEY_1",
        "KEY_2",
        "KEY_3",
        "KEY_4",
        "KEY_5",
        "KEY_6",
        "KEY_7",
        "KEY_8",
        "KEY_9",
        "KEY_RED",
        "KEY_GREEN",
        "KEY_YELLOW",
        "KEY_BLUE",
        "KEY_PLAY",
        "KEY_PAUSE",
        "KEY_STOP",
        "KEY_FF",
        "KEY_REWIND",
        "KEY_REC",
        "KEY_TV",
        "KEY_HDMI",
        "KEY_HDMI1",
        "KEY_HDMI2",
        "KEY_HDMI3",
        "KEY_HDMI4",
        "KEY_CAPTION",
        "KEY_SUB_TITLE",
        "KEY_PICTURE_SIZE",
        "KEY_SLEEP",
        "KEY_APP_LIST",
      ]
    `);
  });

  it('lists each app with its Tizen ids, most recent first', () => {
    expect(TV_APPS.map((app) => `${app.name}=${app.ids.join(',')}`)).toMatchInlineSnapshot(`
      [
        "Netflix=3201907018807,11101200001",
        "YouTube=111299001912",
        "YouTube TV=3201707014489",
        "Prime Video=3201910019365,3201512006785",
        "Disney+=3201901017640,3202009021709,3202204027038",
        "Apple TV=3201807016597",
        "Apple Music=3201908019041",
        "Plex=3201512006963",
        "Spotify=3201606009684",
        "Max=3202301029760",
        "Hulu=3201601007625",
        "Paramount+=3201710014981,3202110025305",
        "Peacock=3202006020991",
        "Twitch=3202203026841",
        "Tubi=3201504001965",
        "Pluto TV=3201808016802",
        "Crunchyroll=3202302030097",
        "DAZN=3201806016390",
        "Xbox=3202203026799",
        "GeForce NOW=3202102023078",
        "SmartThings=3201910019378,3201710015016,3202311033054",
        "Gallery=3201710015037",
        "Browser=org.tizen.browser,3201907018784,3202010022079",
      ]
    `);
    expect(TV_APP_NAMES).toEqual(TV_APPS.map((app) => app.name));
    expect(tvAppNamed('Browser')?.ids[0]).toBe('org.tizen.browser');
    expect(tvAppNamed('browser')).toBeUndefined();
  });

  it('switches inputs with their keys', () => {
    expect(TV_INPUT_SOURCES).toEqual({
      tv: 'KEY_TV',
      hdmi1: 'KEY_HDMI1',
      hdmi2: 'KEY_HDMI2',
      hdmi3: 'KEY_HDMI3',
      hdmi4: 'KEY_HDMI4',
    });
  });
});
