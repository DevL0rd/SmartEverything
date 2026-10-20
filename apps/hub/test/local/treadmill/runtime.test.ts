import { bytesToHex, hexToBytes, supplementStateOf } from '@smarteverything/ble';
import { describe, expect, it } from 'vitest';
import type { TreadmillFrame } from '@smarteverything/domain';
import { FrameDecoder } from '../../../src/local/treadmill/decode';
import { TreadmillRuntime } from '../../../src/local/treadmill/runtime';

const SETTINGS = { weightKg: 70, gradePercent: 4, runSwitchKmh: 8 };

function frame(characteristic: string, hex: string, seconds: number): TreadmillFrame {
  return {
    at: new Date(Date.parse('2026-10-18T10:00:00.000Z') + seconds * 1000).toISOString(),
    characteristic,
    hex,
  };
}

function runtime(family: 'ftms' | 'ftms_supplement' = 'ftms'): TreadmillRuntime {
  return new TreadmillRuntime({
    family,
    identity: {
      manufacturer: null,
      model: null,
      serial: null,
      firmware: null,
      software: null,
      hardware: null,
      motorVersion: null,
      protocol: null,
      capabilityWord: null,
      modelCode: null,
      functionBitmap: null,
      speedMinKmh: null,
      speedMaxKmh: null,
      speedStepKmh: null,
      inclineMinPercent: null,
      inclineMaxPercent: null,
      inclineStepPercent: null,
      features: [],
      targets: [],
    },
    pad: {},
  });
}

const DATA = (speed: number, time: number, steps: number): string =>
  '0424' +
  [speed & 0xff, speed >> 8, 0, 0, 0, time & 0xff, time >> 8, steps & 0xff, steps >> 8, 0]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

describe('a standard fitness machine belt', () => {
  it('runs from a started status and a Treadmill Data frame to a safety stop', () => {
    const belt = runtime();
    const result = belt.ingest(
      [
        frame('2ada', '04', 0),
        frame('2acd', DATA(300, 1, 2), 1),
        frame('2acd', DATA(300, 2, 4), 2),
        frame('2ada', '03', 3),
      ],
      SETTINGS,
    );
    const kinds = result.timeline.flatMap((entry) =>
      entry.kind === 'event' ? [entry.event.kind] : [],
    );
    expect(kinds).toContain('started');
    expect(kinds).toContain('safety_stop');
    expect(kinds).toContain('finished');
    expect(belt.machine.state).toBe('safety_stop');
    expect(result.snapshots.at(-1)?.live.steps).toBe(4);
  });

  it('ignores the stopped status the belt replays after the link comes back, so the walk goes on', () => {
    const belt = runtime();
    belt.ingest([frame('2ada', '04', 0), frame('2acd', DATA(300, 1, 2), 1)], SETTINGS);
    belt.linkInterrupted();
    const resumed = belt.ingest(
      [frame('2ada', '0201', 5), frame('2acd', DATA(300, 6, 12), 6)],
      SETTINGS,
    );
    expect(belt.machine.state).toBe('running');
    expect(resumed.timeline.some((entry) => entry.kind === 'event')).toBe(false);
    const stopped = belt.ingest([frame('2ada', '0201', 9)], SETTINGS);
    expect(belt.machine.state).toBe('stopped');
    expect(
      stopped.timeline.some((entry) => entry.kind === 'event' && entry.event.kind === 'finished'),
    ).toBe(true);
  });

  it('reads the first status of a belt that never lost the link', () => {
    const belt = runtime();
    belt.ingest([frame('2ada', '04', 0), frame('2acd', DATA(300, 1, 2), 1)], SETTINGS);
    belt.ingest([frame('2ada', '0201', 2)], SETTINGS);
    expect(belt.machine.state).toBe('stopped');
  });

  it('notes that the belt took control back and clears it when a command succeeds', () => {
    const belt = runtime();
    const lost = belt.ingest([frame('2ada', 'ff', 0)], SETTINGS);
    expect(lost.controlChanged).toBe(true);
    expect(belt.controlLost).toBe(true);
    const back = belt.ingest([frame('2ad9', '800701', 1)], SETTINGS);
    expect(back.responses).toEqual([{ opcode: 7, result: 'success' }]);
    expect(back.controlChanged).toBe(true);
    expect(belt.controlLost).toBe(false);
  });

  it('keeps a failed control response from clearing the loss', () => {
    const belt = runtime();
    belt.ingest([frame('2ada', 'ff', 0)], SETTINGS);
    belt.ingest([frame('2ad9', '800705', 1)], SETTINGS);
    expect(belt.controlLost).toBe(true);
  });

  it('reports the training status as part of the reading', () => {
    const belt = runtime();
    belt.ingest([frame('2ad3', '000d', 0)], SETTINGS);
    expect(belt.machine.live.trainingStatus).toBe('manual');
  });

  it('collects frames from unknown characteristics and malformed data as unreadable', () => {
    const belt = runtime();
    const result = belt.ingest(
      [frame('ffff', '00', 0), frame('2acd', '0400', 1), frame('2ada', '', 2)],
      SETTINGS,
    );
    expect(result.unreadable).toHaveLength(3);
    expect(belt.machine.state).toBe('idle');
  });
});

describe('a belt with the supplement service', () => {
  const SUPPLEMENT = '24e2521c-f63b-48ed-85be-c5330b00fdf7';

  function supplementHex(first: number, second: number, data: number[]): string {
    const body = [first, second, data.length, ...data];
    return bytesToHex(Uint8Array.from([...body, body.reduce((sum, byte) => sum + byte, 0) & 0xff]));
  }

  it('turns property records into pad preferences, a motor version and a fault code', () => {
    const belt = runtime('ftms_supplement');
    const result = belt.ingest(
      [frame(SUPPLEMENT, supplementHex(0x72, 0x80, [6, 0, 1, 0, 5, 0, 3, 0, 4, 0, 5, 0]), 0)],
      SETTINGS,
    );
    expect(belt.pad.childLock).toBe(true);
    expect(belt.identity.motorVersion).toBe(5);
    expect(belt.fault).toBe('E03');
    expect(result.padChanged).toBe(true);
    expect(result.identityChanged).toBe(true);
  });

  it('keeps the system information and the function bitmap in the identity', () => {
    const belt = runtime('ftms_supplement');
    belt.ingest(
      [
        frame(SUPPLEMENT, supplementHex(0x71, 0x81, [3, 0, 9, 0, 0x0f, 0x01, 0, 0]), 0),
        frame(SUPPLEMENT, supplementHex(0x75, 0x80, [1, 2]), 1),
      ],
      SETTINGS,
    );
    expect(belt.identity).toMatchObject({
      protocol: 3,
      capabilityWord: 0x10f,
      modelCode: 9,
      functionBitmap: '0102',
    });
  });

  it('names an error code the pad reports', () => {
    const belt = runtime('ftms_supplement');
    belt.ingest([frame(SUPPLEMENT, supplementHex(0x72, 0x50, [5, 0, 2, 0]), 0)], SETTINGS);
    expect(belt.fault).toBe('E02');
    expect(supplementStateOf([], belt.supplement).errorCode).toBe(2);
  });
});

describe('frame decoding', () => {
  it('joins a WiLink frame split over two notifications', () => {
    const decoder = new FrameDecoder('wilink');
    const hex = 'f8a2010f01000fd10000ab0012ae3c0000003afd';
    const first = decoder.decode(frame('fe01', hex.slice(0, 16), 0));
    const second = decoder.decode(frame('fe01', hex.slice(16), 1));
    expect(first).toEqual([]);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ kind: 'reading', reading: { timeS: 4049 } });
  });

  it('reports bytes that never formed a frame', () => {
    const decoder = new FrameDecoder('wilink');
    const out = decoder.decode(frame('fe01', bytesToHex(new Uint8Array(30).fill(1)), 0));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'unreadable' });
    expect(hexToBytes('00')).toHaveLength(1);
  });
});

describe('what an incline write waits for', () => {
  it('numbers each control reply by opcode, so a reply is told from an older one', () => {
    const belt = runtime();
    belt.ingest([frame('2ad9', '800001', 0), frame('2ad9', '800305', 1)], SETTINGS);
    expect(belt.replies.get(0)).toEqual({ result: 'success', seq: 1 });
    expect(belt.replies.get(3)).toEqual({ result: 'not_permitted', seq: 2 });
    belt.ingest([frame('2ad9', '800301', 2)], SETTINGS);
    expect(belt.replies.get(3)).toEqual({ result: 'success', seq: 3 });
    expect(belt.replySeq).toBe(3);
  });

  it('counts the target inclination statuses and not the replayed one after a lost link', () => {
    const belt = runtime();
    belt.ingest([frame('2ada', '063c00', 0)], SETTINGS);
    expect(belt.inclineStatusSeq).toBe(1);
    expect(belt.machine.live.targetInclinePercent).toBe(6);
    belt.linkInterrupted();
    belt.ingest([frame('2ada', '064600', 1)], SETTINGS);
    expect(belt.inclineStatusSeq).toBe(1);
    belt.ingest([frame('2ada', '064600', 2)], SETTINGS);
    expect(belt.inclineStatusSeq).toBe(2);
  });

  it('remembers when the step count last grew', () => {
    const belt = runtime();
    expect(belt.lastStepAt).toBeNull();
    belt.ingest([frame('2acd', DATA(300, 1, 2), 1), frame('2acd', DATA(300, 2, 2), 2)], SETTINGS);
    expect(belt.lastStepAt).toBe(frame('2acd', '', 1).at);
    belt.ingest([frame('2acd', DATA(300, 3, 5), 3)], SETTINGS);
    expect(belt.lastStepAt).toBe(frame('2acd', '', 3).at);
  });
});
