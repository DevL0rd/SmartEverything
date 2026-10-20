import type { TreadmillIdentity } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  capabilityLines,
  familyName,
  frameLine,
  gattLines,
  identityFacts,
  inclineRangeBytes,
  inclineRangeLines,
} from './diagnostics-model';

const IDENTITY: TreadmillIdentity = {
  manufacturer: 'KINGSMITH',
  model: 'KS-G15',
  serial: null,
  firmware: '1.2.3',
  software: null,
  hardware: null,
  motorVersion: 7,
  protocol: 2,
  capabilityWord: 255,
  modelCode: null,
  functionBitmap: '0f',
  speedMinKmh: 0.8,
  speedMaxKmh: 15,
  speedStepKmh: 0.1,
  inclineMinPercent: 0,
  inclineMaxPercent: 20,
  inclineStepPercent: 1,
  features: ['cadence', 'step_count'],
  targets: [],
};

describe('what the diagnostics page tells', () => {
  it('lists only the identity facts the belt answered', () => {
    expect(identityFacts(IDENTITY)).toEqual([
      { label: 'Manufacturer', value: 'KINGSMITH' },
      { label: 'Model', value: 'KS-G15' },
      { label: 'Firmware', value: '1.2.3' },
      { label: 'Motor version', value: '7' },
      { label: 'Protocol', value: '2' },
      { label: 'Speed range', value: '0.8 to 15.0 km/h' },
    ]);
  });

  it('writes the capability word, the function bitmap, the features and the targets', () => {
    expect(capabilityLines(IDENTITY)).toEqual([
      'Capability word 0xff',
      'Function bitmap 0f',
      'Features cadence, step_count',
    ]);
  });

  it('prints the table of services and characteristics', () => {
    expect(
      gattLines({
        name: 'KS-G15',
        services: [
          {
            uuid: 'fe00',
            characteristics: [
              { uuid: 'fe01', properties: ['notify'] },
              { uuid: 'fe02', properties: ['write', 'write_no_response'], value: '00ff' },
            ],
          },
        ],
      }),
    ).toEqual(['KS-G15', 'Service fe00', '  fe01 notify', '  fe02 write write_no_response = 00ff']);
  });

  it('names the protocol family and prints a raw frame', () => {
    expect(familyName('wilink')).toBe('WiLink');
    expect(familyName('ftms')).toBe('Plain Bluetooth FTMS');
    expect(frameLine({ at: '2026-10-18T10:00:05.000Z', characteristic: 'fe01', hex: 'f8a2' })).toBe(
      '10:00:05 fe01 f8a2',
    );
  });

  it('shows the incline range and the raw 2AD5 bytes, or says they were not read', () => {
    const dump = {
      name: 'KS-G15',
      services: [
        {
          uuid: '1826',
          characteristics: [{ uuid: '2ad5', properties: ['read' as const], value: '0000c8000a00' }],
        },
      ],
    };
    expect(inclineRangeBytes(dump)).toBe('0000c8000a00');
    expect(inclineRangeLines(IDENTITY, dump)).toEqual([
      'Incline range 0.0 to 20.0, step 1.0',
      '2AD5 bytes 0000c8000a00',
    ]);
    const bare = { name: 'KS-G15', services: [{ uuid: '1826', characteristics: [] }] };
    expect(inclineRangeBytes(bare)).toBeNull();
    expect(
      inclineRangeLines({ ...IDENTITY, inclineMinPercent: null, inclineMaxPercent: null }, bare),
    ).toEqual(['Incline range not reported', '2AD5 bytes not read']);
  });
});
