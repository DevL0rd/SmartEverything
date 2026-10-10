import { CommandRefusedError, DISCOVERED_DEVICE } from '@smarteverything/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SamsungTvMessageError } from '../src/errors';
import { artModeStatusRequest, readArtData, setArtModeRequest } from '../src/samsung-tv/art';
import {
  ART_MODE_CAPABILITY,
  resolveTvCommand,
  TV_CAPABILITIES,
  tvCapabilities,
  tvDevice,
} from '../src/samsung-tv/device';
import { readDeviceInfo } from '../src/samsung-tv/power';
import {
  FRAME_POWER_HOLD_MS,
  KEY_COMMANDS,
  keyMessage,
  powerOffSteps,
  readTvMessage,
  remoteUrl,
} from '../src/samsung-tv/remote';

function d2d(data: Record<string, unknown>): string {
  return JSON.stringify({ event: 'd2d_service_message', data: JSON.stringify(data) });
}

function parsedSteps(frame: boolean): unknown[] {
  return powerOffSteps(frame).map((step): unknown =>
    step.kind === 'send' ? JSON.parse(step.message) : step,
  );
}

function remoteKey(cmd: string): unknown {
  return {
    method: 'ms.remote.control',
    params: { Cmd: cmd, DataOfCmd: 'KEY_POWER', Option: 'false', TypeOfRemote: 'SendRemoteKey' },
  };
}

describe('recognising a Frame TV', () => {
  it('reads FrameTVSupport from the device information', () => {
    const frame = (device: Record<string, unknown>): boolean =>
      readDeviceInfo({ device: { PowerState: 'on', ...device } }).frame;
    expect(frame({ FrameTVSupport: 'true' })).toBe(true);
    expect(frame({ FrameTVSupport: 'false' })).toBe(false);
    expect(frame({})).toBe(false);
    expect(() => readDeviceInfo({ device: { FrameTVSupport: true } })).toThrow(
      /^The Samsung TV sent a message that could not be read: device information: .*FrameTVSupport/s,
    );
  });
});

describe('powering a television off', () => {
  it('knows the three key commands a remote sends', () => {
    expect(KEY_COMMANDS).toEqual(['Click', 'Press', 'Release']);
    expect(JSON.parse(keyMessage('KEY_POWER', 'Press'))).toEqual(remoteKey('Press'));
  });

  it('clicks the power key on a regular television', () => {
    expect(parsedSteps(false)).toEqual([remoteKey('Click')]);
  });

  it('holds the power key for three seconds on a Frame TV', () => {
    expect(FRAME_POWER_HOLD_MS).toBe(3000);
    expect(parsedSteps(true)).toEqual([
      remoteKey('Press'),
      { kind: 'wait', ms: 3000 },
      remoteKey('Release'),
    ]);
  });
});

describe('the art channel', () => {
  it('connects to com.samsung.art-app on the secure port with the token', () => {
    expect(remoteUrl('tv.local', 'art', 'SmartEverything', 'token-1')).toBe(
      'wss://tv.local:8002/api/v2/channels/com.samsung.art-app?name=U21hcnRFdmVyeXRoaW5n&token=token-1',
    );
  });

  it('asks for and sets the art mode with a correlated request id', () => {
    const envelope = (text: string): unknown => {
      const parsed: unknown = JSON.parse(text);
      return parsed;
    };
    expect(envelope(artModeStatusRequest('id-1'))).toEqual({
      method: 'ms.channel.emit',
      params: {
        event: 'art_app_request',
        to: 'host',
        data: '{"request":"get_artmode_status","id":"id-1","request_id":"id-1"}',
      },
    });
    expect(envelope(setArtModeRequest('id-2', true))).toMatchObject({
      params: {
        data: '{"request":"set_artmode_status","value":"on","id":"id-2","request_id":"id-2"}',
      },
    });
    expect(envelope(setArtModeRequest('id-3', false))).toMatchObject({
      params: {
        data: '{"request":"set_artmode_status","value":"off","id":"id-3","request_id":"id-3"}',
      },
    });
  });

  it('reads that the channel is ready', () => {
    expect(readTvMessage('{"event":"ms.channel.ready","data":{}}')).toEqual({ kind: 'ready' });
  });

  it('reads the art mode from status answers and pushed changes', () => {
    expect(readTvMessage(d2d({ event: 'artmode_status', value: 'on', id: 'id-1' }))).toEqual({
      kind: 'art_mode',
      on: true,
      requestId: 'id-1',
    });
    expect(
      readTvMessage(
        d2d({ event: 'get_artmode_status', status: 'off', request_id: 'id-2', id: 'x' }),
      ),
    ).toEqual({ kind: 'art_mode', on: false, requestId: 'id-2' });
    expect(readTvMessage(d2d({ event: 'art_mode_changed', status: 'on', value: 'off' }))).toEqual({
      kind: 'art_mode',
      on: true,
      requestId: null,
    });
    expect(readTvMessage(d2d({ event: 'artmode_status', value: 'off', status: 'on' }))).toEqual({
      kind: 'art_mode',
      on: false,
      requestId: null,
    });
  });

  it('reads failures and acknowledgements without an art mode', () => {
    expect(readArtData(JSON.stringify({ event: 'error', error_code: -1, id: 'id-3' }))).toEqual({
      kind: 'art_failed',
      requestId: 'id-3',
      errorCode: '-1',
    });
    expect(readArtData(JSON.stringify({ event: 'error', error_code: '404' }))).toEqual({
      kind: 'art_failed',
      requestId: null,
      errorCode: '404',
    });
    expect(readArtData(JSON.stringify({ event: 'error' }))).toEqual({
      kind: 'art_failed',
      requestId: null,
      errorCode: null,
    });
    expect(readArtData(JSON.stringify({ event: 'set_artmode_status', id: 'id-4' }))).toEqual({
      kind: 'art_other',
      event: 'set_artmode_status',
      requestId: 'id-4',
    });
    expect(readArtData(JSON.stringify({ event: 'go_to_standby', value: 'on' }))).toEqual({
      kind: 'art_other',
      event: 'go_to_standby',
      requestId: null,
    });
  });

  it('refuses art messages it cannot read, naming what was received', () => {
    expect(() => readArtData({ event: 'artmode_status' })).toThrow(
      'The Samsung TV sent a message that could not be read: d2d_service_message data is not a JSON string. Received {"event":"artmode_status"}.',
    );
    expect(() => readArtData('{')).toThrow(
      /^The Samsung TV sent a message that could not be read: d2d_service_message data: SyntaxError.* Received "\{"\.$/,
    );
    expect(() => readArtData('{"event":""}')).toThrow(
      /^The Samsung TV sent a message that could not be read: d2d_service_message data: .*Received \{"event":""\}\.$/s,
    );
    expect(() => readArtData('{"event":"artmode_status","value":"maybe"}')).toThrow(
      SamsungTvMessageError,
    );
    expect(() => readArtData('{"event":"art_mode_changed","value":"on"}')).toThrow(
      'The Samsung TV sent a message that could not be read: art_mode_changed without an on or off status. Received {"event":"art_mode_changed","value":"on"}.',
    );
  });

  it('reads any on or off art mode the TV reports', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.string({ minLength: 1 }), (on, id) => {
        expect(
          readArtData(JSON.stringify({ event: 'artmode_status', value: on ? 'on' : 'off', id })),
        ).toEqual({ kind: 'art_mode', on, requestId: id });
      }),
    );
  });
});

describe('the Frame TV as a device', () => {
  const identity = {
    host: '192.168.1.21',
    macAddress: 'A1:B2:C3:D4:E5:F7',
    name: 'The Frame',
    model: 'QE55LS03D',
    frame: true,
  };

  it('offers art mode only on a Frame TV', () => {
    expect(ART_MODE_CAPABILITY).toEqual({
      key: 'art_mode',
      label: 'Art mode',
      access: 'read_write',
      value: { kind: 'boolean' },
    });
    expect(tvCapabilities(false)).toEqual(TV_CAPABILITIES);
    expect(tvCapabilities(true)).toEqual([...TV_CAPABILITIES, ART_MODE_CAPABILITY]);
    const device = DISCOVERED_DEVICE.parse(tvDevice(identity, true));
    expect(device.capabilities.at(-1)).toEqual(ART_MODE_CAPABILITY);
    expect(device.details).toEqual({
      host: '192.168.1.21',
      macAddress: 'A1:B2:C3:D4:E5:F7',
      powerStatePolling: true,
      frameTv: true,
    });
  });

  it('turns art mode commands into art mode changes on a Frame TV only', () => {
    expect(resolveTvCommand('art_mode', true, true)).toEqual({ kind: 'art_mode', on: true });
    expect(resolveTvCommand('art_mode', false, true)).toEqual({ kind: 'art_mode', on: false });
    expect(resolveTvCommand('power', false, true)).toEqual({ kind: 'power', on: false });
    expect(() => resolveTvCommand('art_mode', 'on', true)).toThrow(
      new CommandRefusedError('art_mode', 'expected true or false'),
    );
    expect(() => resolveTvCommand('art_mode', true, false)).toThrow(
      new CommandRefusedError('art_mode', 'the television does not have it'),
    );
  });
});
