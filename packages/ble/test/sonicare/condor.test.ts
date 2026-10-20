import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CondorAssembler,
  CondorFramingError,
  MESSAGE,
  STATE_PORTS,
  bytesToHex,
  changeIndResponseFrame,
  chunksOf,
  frameOf,
  getPortsFrame,
  getPropsFrame,
  hexToBytes,
  jsonOfIndication,
  parseChangeInd,
  parseGenericResp,
  portDelta,
  portOfProps,
  putPropsFrame,
  sensorDelta,
  subscribeFrame,
} from '../../src';
import { condorPorts } from './fixtures';

const ENCODER = new TextEncoder();

function joined(...parts: readonly Uint8Array[]): Uint8Array {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    all.set(part, offset);
    offset += part.length;
  }
  return all;
}

function indication(port: string, json: string): Uint8Array {
  return frameOf(
    MESSAGE.changeInd,
    joined(
      ENCODER.encode(`1/${port}`),
      new Uint8Array([0]),
      ENCODER.encode(json),
      new Uint8Array([0]),
    ),
  );
}

describe('building frames', () => {
  it('starts every frame with fe ff, the type and a big endian length', () => {
    expect(bytesToHex(frameOf(MESSAGE.initializeReq))).toBe('feff010000');
    expect(bytesToHex(getPortsFrame('1'))).toBe('feff0b00023100');
  });

  it('addresses a port with nul separated product and port names', () => {
    expect(bytesToHex(getPropsFrame('Battery'))).toBe('feff04000a31004261747465727900');
  });

  it('subscribes for a year and puts properties as json', () => {
    const subscribe = subscribeFrame('Battery');
    expect(new TextDecoder().decode(subscribe.subarray(5 + 10))).toBe('{"timeout":31536000}');
    const put = putPropsFrame('SensorData', { Sensors: 3 });
    expect(new TextDecoder().decode(put.subarray(5 + 13))).toBe('{"Sensors":3}');
  });

  it('answers a change indication with no error and a reserved zero', () => {
    expect(bytesToHex(changeIndResponseFrame())).toBe('feff0900020000');
  });
});

describe('chunking a frame for the radio', () => {
  it('splits at nineteen payload bytes with a rising sequence', () => {
    const frame = new Uint8Array(45).fill(7);
    const { chunks, nextSequence } = chunksOf(frame, 5);
    expect(chunks.map((chunk) => chunk.length)).toStrictEqual([20, 20, 8]);
    expect(chunks.map((chunk) => chunk[0])).toStrictEqual([5, 6, 7]);
    expect(nextSequence).toBe(8);
  });

  it('wraps the sequence after 63 and never marks a chunk as start or binary', () => {
    const { chunks, nextSequence } = chunksOf(new Uint8Array(40).fill(1), 62);
    expect(chunks.map((chunk) => chunk[0])).toStrictEqual([62, 63, 0]);
    expect(nextSequence).toBe(1);
  });
});

describe('reassembling what the handle sends', () => {
  it('joins one frame split over several notifications and acks each sequence', () => {
    const frame = indication('Battery', '{"BatteryPercent":67,"BatteryMV":3811}');
    const { chunks } = chunksOf(frame, 9);
    const assembler = new CondorAssembler();
    const pushed = chunks.map((chunk) => assembler.push(chunk));
    expect(pushed.map((item) => item.ack)).toStrictEqual(chunks.map((chunk) => chunk[0]));
    expect(pushed.slice(0, -1).every((item) => item.messages.length === 0)).toBe(true);
    const last = pushed.at(-1)?.messages ?? [];
    expect(last).toHaveLength(1);
    expect(last[0]?.type).toBe(MESSAGE.changeInd);
  });

  it('splits two frames that arrive together', () => {
    const both = joined(
      indication('Battery', '{"BatteryPercent":50}'),
      indication('Sonicare', '{"HandleState":2}'),
    );
    const assembler = new CondorAssembler();
    const pushed = assembler.push(joined(new Uint8Array([3]), both));
    expect(pushed.ack).toBe(3);
    expect(pushed.messages).toHaveLength(2);
  });

  it('fails loudly on a stream that does not start with a frame mark and starts over', () => {
    const assembler = new CondorAssembler();
    expect(() => assembler.push(hexToBytes('00aabbccddeeff0011'))).toThrow(CondorFramingError);
    expect(
      assembler.push(joined(new Uint8Array([1]), frameOf(MESSAGE.initializeResp))).messages,
    ).toHaveLength(1);
  });

  it('ignores an empty notification and masks the sequence bits', () => {
    const assembler = new CondorAssembler();
    expect(assembler.push(new Uint8Array(0))).toStrictEqual({ ack: null, messages: [] });
    expect(assembler.push(hexToBytes('c1')).ack).toBe(1);
  });

  it('can be reset in the middle of a frame', () => {
    const assembler = new CondorAssembler();
    assembler.push(hexToBytes('01feff0800ff'));
    assembler.reset();
    expect(
      assembler.push(joined(new Uint8Array([2]), frameOf(MESSAGE.initializeResp))).messages,
    ).toHaveLength(1);
  });
});

describe('reading messages', () => {
  it('reads the product and port of a change indication, which are separated by a slash', () => {
    const message = new CondorAssembler().push(
      joined(new Uint8Array([0]), indication('RoutineStatus', '{"Duration":23}')),
    ).messages[0];
    const parsed = parseChangeInd(message?.body ?? new Uint8Array(0));
    expect(parsed).toMatchObject({ product: '1', port: 'RoutineStatus' });
    expect(jsonOfIndication(parsed)).toStrictEqual({ Duration: 23 });
  });

  it('keeps the binary tail of a sensor port as it is', () => {
    const body = joined(
      ENCODER.encode('1/SensorData.b'),
      new Uint8Array([0]),
      hexToBytes('0100010002'),
    );
    const parsed = parseChangeInd(body);
    expect(parsed.port).toBe('SensorData.b');
    expect(sensorDelta(parsed.body)).toStrictEqual({ pressure: 'too_high' });
  });

  it('refuses a change indication that names no product and port', () => {
    expect(() => parseChangeInd(ENCODER.encode('nothing'))).toThrow(CondorFramingError);
  });

  it('reads a status byte with an optional json body', () => {
    expect(parseGenericResp(hexToBytes('00'))).toStrictEqual({ status: 0, json: null });
    expect(
      parseGenericResp(joined(new Uint8Array([3]), ENCODER.encode('{"a":1}\0'))),
    ).toStrictEqual({
      status: 3,
      json: { a: 1 },
    });
    expect(() => parseGenericResp(new Uint8Array(0))).toThrow(CondorFramingError);
  });
});

describe('the ports of a recorded Series 7100', () => {
  const ports = condorPorts('fx_condor_hx742x', '1');

  it('turns every state port into the same facts a Classic handle gives', () => {
    const delta = STATE_PORTS.reduce(
      (all, port) => ({ ...all, ...portDelta(port, ports[port]) }),
      {},
    );
    expect(delta).toMatchObject({
      handleState: 'run',
      brushingState: 'on',
      routineIds: [0, 5, 1, 2, 0],
      sessionId: 7,
      modePosition: 0,
      elapsedS: 23,
      routineS: 120,
      intensity: 0,
      headSerial: '04:50:6D:D2:AE:22:91',
      headLimitS: 21600,
      headUsageS: 1962,
      headRing: 2,
      nfcVersion: '2.1',
      latestStoredId: 6,
      storedCount: 7,
      errorPersistent: 1073741888,
      errorVolatile: 1073741824,
      settingsBits: 512,
      sensorMask: 0,
    });
  });

  it('reports battery percent and millivolts together', () => {
    expect(portDelta('Battery', { BatteryPercent: 67, BatteryMV: 3811 })).toStrictEqual({
      battery: 67,
      batteryMillivolts: 3811,
    });
  });

  it('keeps an unscanned head serial out of the facts', () => {
    expect(portDelta('BrushHead', { SerialNumber: [0, 0, 0, 0, 0, 0, 0] })).toStrictEqual({
      headSerial: undefined,
      headLimitS: undefined,
      headUsageS: undefined,
      headRing: undefined,
      nfcVersion: undefined,
    });
  });

  it('maps the model name of the firmware port and ignores ports it does not know', () => {
    expect(portDelta('firmware', { name: 'HX742X', version: '1.8.20' })).toStrictEqual({
      model: 'HX742X',
      firmware: '1.8.20',
    });
    expect(portDelta('Strange', { a: 1 })).toStrictEqual({});
    expect(portDelta('Battery', null)).toStrictEqual({});
  });

  it('knows which port a read answer came from by the names it carries', () => {
    expect(STATE_PORTS.map((port) => portOfProps(ports[port]))).toStrictEqual([...STATE_PORTS]);
    expect(portOfProps({ name: 'HX742X', canupgrade: false })).toBe('firmware');
    expect(portOfProps({ nothing: 1 })).toBeNull();
    expect(portOfProps(null)).toBeNull();
  });

  it('refuses a property of the wrong type', () => {
    expect(() => portDelta('Battery', { BatteryPercent: 'full' })).toThrow();
  });
});

describe('framing is robust', () => {
  it('never throws anything but a framing error on random bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 64 }), (bytes) => {
        const assembler = new CondorAssembler();
        try {
          assembler.push(bytes);
        } catch (error) {
          expect(error).toBeInstanceOf(CondorFramingError);
        }
      }),
    );
  });

  it('gives back every frame that was chunked, whatever the size', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 300 }),
        fc.integer({ min: 0, max: 63 }),
        (body, start) => {
          const frame = frameOf(MESSAGE.genericResp, body);
          const assembler = new CondorAssembler();
          const messages = chunksOf(frame, start).chunks.flatMap(
            (chunk) => assembler.push(chunk).messages,
          );
          expect(messages).toHaveLength(1);
          expect(bytesToHex(messages[0]?.body ?? new Uint8Array(1))).toBe(bytesToHex(body));
        },
      ),
    );
  });
});
