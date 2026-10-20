import { describe, expect, it } from 'vitest';
import {
  TYPE_URL_PREFIX,
  LarqFrameError,
  LarqRefusedError,
  LarqResponseError,
  decodeAccelerometer,
  decodeLogPage,
  decodeLowBattery,
  decodeReminder,
  decodeResponse,
  decodeTofSettings,
  decodeTofState,
  decodeUiState,
  encodeRequest,
  expectAcknowledged,
  expectBody,
  hexToBytes,
  logRequest,
  readRequest,
  requestIdOf,
  requestNameOfFrame,
  setReminderRequest,
  setTimeRequest,
} from '../../src';
import { concatBytes, encodeMessage, encodeString } from '../../src/larq/wire';
import {
  ACTIVATION_LOG_RESPONSE,
  GET_ACTIVATION_LOG_REQUEST,
  GET_TOF_LOG_REQUEST,
  GET_UI_STATE_REQUEST,
  LOW_BATTERY_RESPONSE,
  NOT_SUPPORTED_RESPONSE,
  REMINDER_RESPONSE,
  SET_REMINDER_REQUEST,
  SET_TIME_REQUEST,
  TOF_LOG_RESPONSE,
  TOF_SETTINGS_RESPONSE,
  TOF_STATE_RESPONSE,
  UI_STATE_RESPONSE,
} from './vectors';

const bytes = hexToBytes;

describe('LARQ requests match the recorded vectors byte for byte', () => {
  it('asks for the cap state', () => {
    expect(readRequest(1, 'RequestGetCapUiState').toHex()).toBe(GET_UI_STATE_REQUEST);
  });

  it('sets the cap clock from epoch milliseconds', () => {
    expect(setTimeRequest(7, 1_790_000_000_000).toHex()).toBe(SET_TIME_REQUEST);
  });

  it('pages the distance log from a cursor', () => {
    expect(logRequest(3, 'tof', 1_789_999_999, 5).toHex()).toBe(GET_TOF_LOG_REQUEST);
  });

  it('pages the UV log from the start of history', () => {
    expect(logRequest(12, 'activation', 0, 6).toHex()).toBe(GET_ACTIVATION_LOG_REQUEST);
  });

  it('writes a reminder with the colour fields that differ from zero only', () => {
    expect(
      setReminderRequest(11, {
        state: 'off',
        startSeconds: 1,
        stopSeconds: 86_400,
        intervalSeconds: 0,
        colour: { red: 0, green: 0, blue: 1 },
      }).toHex(),
    ).toBe(SET_REMINDER_REQUEST);
  });

  it('reads the id and the name back out of a request frame', () => {
    expect(requestIdOf(bytes(SET_TIME_REQUEST))).toBe(7);
    expect(requestNameOfFrame(bytes(SET_TIME_REQUEST))).toBe('RequestSetCapTimeSettings');
    expect(() => requestIdOf(encodeMessage(2, new Uint8Array(0)))).toThrow(LarqFrameError);
    expect(() => requestNameOfFrame(bytes(UI_STATE_RESPONSE))).toThrow(LarqFrameError);
    const answer = concatBytes(
      encodeMessage(2, encodeString(1, `${TYPE_URL_PREFIX}ResponseGetCapUiState`)),
    );
    expect(() => requestNameOfFrame(answer)).toThrow(/not a request/u);
  });
});

describe('LARQ responses decode the recorded vectors', () => {
  it('reads the cap state and its power saving flag', () => {
    expect(decodeUiState(bytes(UI_STATE_RESPONSE))).toStrictEqual({
      state: 'charging',
      stateCode: 8,
      powerSaving: 'off',
    });
  });

  it('reads two distance rows with their trigger, kcps and LED resistance', () => {
    expect(decodeLogPage(bytes(TOF_LOG_RESPONSE), 'tof')).toStrictEqual([
      { at: 1_790_000_100, trigger: 'cap', distanceMm: 120, kcps: 6500, ledOhm: 10_000.5 },
      { at: 1_790_000_200, trigger: 'interval', distanceMm: 135, kcps: 6100, ledOhm: 9990.25 },
    ]);
  });

  it('reads the distance sensor settings', () => {
    expect(decodeTofSettings(bytes(TOF_SETTINGS_RESPONSE))).toStrictEqual({
      mode: 'event',
      intervalTrigger: true,
      intervalSeconds: 300,
      accelerometerCheckSeconds: 5,
      bottleSizeMl: 680,
      accelerometerTimeoutSeconds: 10,
    });
  });

  it('reads the reminder with its window, interval and colour', () => {
    expect(decodeReminder(bytes(REMINDER_RESPONSE))).toStrictEqual({
      state: 'interval_fixed',
      startSeconds: 28_800,
      stopSeconds: 79_200,
      intervalSeconds: 3600,
      colour: { red: 1, green: 0.5, blue: 0.25, alpha: 1 },
    });
  });

  it('reads one live distance measurement', () => {
    expect(decodeTofState(bytes(TOF_STATE_RESPONSE))).toStrictEqual({
      distanceMm: 42,
      kcps: 12_000,
    });
  });

  it('reads the low battery thresholds', () => {
    expect(decodeLowBattery(bytes(LOW_BATTERY_RESPONSE))).toStrictEqual({
      alertPct: 20,
      lockoutPct: 5,
    });
  });

  it('reads a UV cycle row with its battery charge', () => {
    expect(decodeLogPage(bytes(ACTIVATION_LOG_RESPONSE), 'activation')).toStrictEqual([
      { at: 1_790_000_300, mode: 'maintenance', socPct: 87 },
    ]);
  });

  it('says a request is not supported rather than guessing', () => {
    const response = decodeResponse(bytes(NOT_SUPPORTED_RESPONSE));
    expect(response).toStrictEqual({
      requestId: 9,
      code: 'not_supported',
      typeName: null,
      value: new Uint8Array(0),
    });
    expect(() => expectBody(response, 'RequestGetCapUiState')).toThrow(LarqResponseError);
    expect(() => {
      expectAcknowledged(response, 'RequestSetCapTimeSettings');
    }).toThrow(LarqResponseError);
  });

  it('says nothing came back when a getter is answered with an empty success', () => {
    expect(() =>
      expectBody(decodeResponse(bytes('0d070000001001')), 'RequestGetCapUiState'),
    ).toThrow(/answered nothing/u);
  });

  it('names the wrong answer when a cap answers with another message type', () => {
    expect(() => decodeTofState(bytes(UI_STATE_RESPONSE))).toThrow(/ResponseGetCapUiState/u);
    expect(() => decodeAccelerometer(bytes(LOW_BATTERY_RESPONSE))).toThrow(LarqResponseError);
  });

  it('treats a successful setter answer with no body as acknowledged', () => {
    expect(() => {
      expectAcknowledged(decodeResponse(bytes('0d070000001001')), 'RequestSetCapTimeSettings');
    }).not.toThrow();
  });

  it('refuses a response code or type address it does not know', () => {
    expect(() => decodeResponse(bytes('0d010000001005'))).toThrow(LarqFrameError);
    expect(() => decodeResponse(bytes('0d0100000010011a060a0461626364'))).toThrow(LarqFrameError);
  });
});

describe('LARQ requests the app will never send', () => {
  it('refuses a request that can brick the cap, naming why', () => {
    expect(() => encodeRequest(1, 'RequestCapFactoryReset')).toThrow(/brick/u);
    expect(() => encodeRequest(1, 'RequestCapEnterDfuMode')).toThrow(LarqRefusedError);
    expect(() => encodeRequest(1, 'RequestSetCapUvConfig')).toThrow(LarqRefusedError);
  });

  it('refuses a request it has never heard of', () => {
    expect(() => encodeRequest(1, 'RequestSomethingNew')).toThrow(/not one of the requests/u);
  });

  it('refuses a request id outside 1 to 4294967295 and a frame that is too big', () => {
    expect(() => encodeRequest(0, 'RequestGetCapUiState')).toThrow(LarqFrameError);
    expect(() => encodeRequest(2 ** 32, 'RequestGetCapUiState')).toThrow(LarqFrameError);
    expect(() => encodeRequest(1.5, 'RequestGetCapUiState')).toThrow(LarqFrameError);
    expect(() => encodeRequest(1, 'RequestGetCapUiState', new Uint8Array(200).fill(1))).toThrow(
      /182/u,
    );
  });
});
