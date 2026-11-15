import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_DRIVE_TUNING,
  DESKTOP_DRIVE_TUNING,
  type DesktopDriveTuningLimits,
  type DesktopDriveTuningState,
} from '@smarteverything/domain';
import {
  congestionOf,
  entryOf,
  fieldProblemOf,
  inFlightGaugeOf,
  initialTextOf,
  missingOnWindows,
  remountPending,
  remountPendingFor,
  secondsOf,
  sizeOf,
  tuningAllDefault,
  tuningIsDefault,
  tuningProblemOf,
  tuningReset,
  tuningWith,
  valueTextOf,
} from './advanced-model';
import { hubProblemOf, hubResetAll } from './advanced-hub';
import { COMPUTER_ROWS, HUB_ROWS, subtitleOf } from './advanced-rows';

const DEFAULTS = DEFAULT_DESKTOP_DRIVE_TUNING;

const LINUX: DesktopDriveTuningLimits = {
  platform: 'linux',
  pageBytes: 4096,
  maxUserBackground: 20_793,
  maxUserCongestionThreshold: 15_594,
  maxRequestBytes: 1_048_576,
  kernelReadaheadOfferBytes: 131_072,
};

function stateOf(saved = DEFAULTS, applied = DEFAULTS): DesktopDriveTuningState {
  return { saved, applied: [{ placementId: 'p1', tuning: applied }], limits: LINUX };
}

describe('mount tuning entries', () => {
  it('reads sizes in binary units and plain bytes', () => {
    expect(sizeOf('128K')).toBe(131_072);
    expect(sizeOf('1 MiB')).toBe(1_048_576);
    expect(sizeOf('16mb')).toBe(16_777_216);
    expect(sizeOf('4096')).toBe(4096);
    expect(sizeOf('0')).toBe(0);
    expect(sizeOf('1.5x')).toBeNull();
    expect(sizeOf('0.3')).toBeNull();
  });

  it('reads plain numbers as seconds', () => {
    expect(secondsOf('30')).toBe(30);
    expect(secondsOf('5m')).toBe(300);
    expect(secondsOf('1h')).toBe(3600);
    expect(secondsOf('0')).toBe(0);
    expect(secondsOf('soon')).toBeNull();
  });

  it('keeps until changed and follows max background when left empty', () => {
    expect(entryOf('keep', '')).toBe('changed');
    expect(entryOf('keep', '60')).toBe(60);
    expect(entryOf('follow', '')).toBe('follow');
    expect(entryOf('follow', '20')).toBe(20);
    expect(initialTextOf('keep', 'changed')).toBe('');
    expect(initialTextOf('bytes', 1_048_576)).toBe('1M');
    expect(initialTextOf('bytes', 131_072)).toBe('128K');
  });

  it('writes values in plain words', () => {
    expect(valueTextOf('keep', 'changed', 'Never')).toBe('Until changed');
    expect(valueTextOf('bytes', 0, 'Off')).toBe('Off');
    expect(valueTextOf('seconds', 0, 'None')).toBe('None');
    expect(valueTextOf('seconds', 30, 'None')).toBe('30 seconds');
    expect(valueTextOf('readdir', 'auto', 'Off')).toBe('Auto');
    expect(valueTextOf('switch', true, 'Off')).toBe('On');
  });
});

describe('mount tuning bounds', () => {
  it('accepts the defaults against the reported limits and the schema', () => {
    expect(tuningProblemOf(DEFAULTS, LINUX)).toBeNull();
    expect(DESKTOP_DRIVE_TUNING.safeParse(DEFAULTS).success).toBe(true);
  });

  it('names the kernel bound for requests in flight', () => {
    expect(
      fieldProblemOf(DEFAULTS, LINUX, { field: 'maxBackground', kind: 'count' }, '30000'),
    ).toBe('The kernel allows up to 20,793 here');
    expect(fieldProblemOf(DEFAULTS, null, { field: 'maxBackground', kind: 'count' }, '70000')).toBe(
      'FUSE allows up to 65,535',
    );
    expect(
      fieldProblemOf(DEFAULTS, LINUX, { field: 'maxBackground', kind: 'count' }, '512'),
    ).toBeNull();
  });

  it('keeps the threshold within the requests in flight', () => {
    expect(
      fieldProblemOf(DEFAULTS, LINUX, { field: 'congestionThreshold', kind: 'follow' }, '65'),
    ).toBe('Use at most the requests in flight, 64');
    const lowered = tuningWith(DEFAULTS, 'congestionThreshold', 60);
    expect(fieldProblemOf(lowered, LINUX, { field: 'maxBackground', kind: 'count' }, '32')).toBe(
      'Use at most the requests in flight, 32',
    );
    expect(congestionOf(DEFAULTS)).toBe(48);
  });

  it('bounds request size and kernel window by page size and the kernel', () => {
    expect(fieldProblemOf(DEFAULTS, LINUX, { field: 'maxRequestBytes', kind: 'bytes' }, '2M')).toBe(
      'The kernel allows up to 1.0 MB here',
    );
    expect(fieldProblemOf(DEFAULTS, LINUX, { field: 'maxRequestBytes', kind: 'bytes' }, '1K')).toBe(
      'Use a size of at least 4.0 KB',
    );
    expect(
      fieldProblemOf(DEFAULTS, LINUX, { field: 'kernelReadaheadBytes', kind: 'bytes' }, '1M'),
    ).toBe('The kernel offers up to 128 KB here');
  });

  it('keeps the lost-connection time above the check interval', () => {
    expect(
      fieldProblemOf(DEFAULTS, LINUX, { field: 'deadAfterSeconds', kind: 'seconds' }, '10'),
    ).toBe('Use more than the check interval, 10 seconds');
    expect(fieldProblemOf(DEFAULTS, LINUX, { field: 'pingSeconds', kind: 'seconds' }, '0')).toBe(
      'Use 1 second or more',
    );
    expect(
      fieldProblemOf(DEFAULTS, LINUX, { field: 'bulkFrameBytes', kind: 'bytes' }, '2M'),
    ).toContain('1.0');
  });
});

describe('mount tuning state', () => {
  it('resets one field and knows when all are default', () => {
    const changed = tuningWith(DEFAULTS, 'uploadFiles', 8);
    expect(tuningIsDefault(changed, 'uploadFiles')).toBe(false);
    expect(tuningAllDefault(changed)).toBe(false);
    expect(tuningAllDefault(tuningReset(changed, 'uploadFiles'))).toBe(true);
  });

  it('marks only remount fields that differ from a running mount', () => {
    const saved = tuningWith(tuningWith(DEFAULTS, 'maxBackground', 128), 'uploadFiles', 8);
    const state = stateOf(saved);
    expect(remountPendingFor(state, 'maxBackground')).toBe(true);
    expect(remountPendingFor(state, 'congestionThreshold')).toBe(true);
    expect(remountPendingFor(state, 'uploadFiles')).toBe(false);
    expect(remountPending(state)).toBe(true);
    expect(remountPending({ ...state, applied: [] })).toBe(false);
  });

  it('compares the threshold by its value, as the helper reports it', () => {
    const applied = tuningWith(DEFAULTS, 'congestionThreshold', 48);
    expect(remountPendingFor(stateOf(DEFAULTS, applied), 'congestionThreshold')).toBe(false);
  });

  it('shows the threshold against the kernel ceiling', () => {
    expect(inFlightGaugeOf(DEFAULTS, LINUX)).toEqual({
      max: 64,
      congestion: 48,
      ceiling: 20_793,
    });
  });

  it('marks the kernel-only fields as missing on Windows', () => {
    expect(missingOnWindows('maxBackground')).toBe(true);
    expect(missingOnWindows('readdirPlus')).toBe(true);
    expect(missingOnWindows('uploadFiles')).toBe(false);
  });

  it('gives every row its default and where it comes from', () => {
    expect(COMPUTER_ROWS.map((spec) => spec.field).sort()).toEqual(Object.keys(DEFAULTS).sort());
    const background = COMPUTER_ROWS.find((spec) => spec.field === 'maxBackground');
    expect(background && subtitleOf(background, DEFAULTS)).toBe('Default 64, like NFS 4.2');
  });
});

describe('Hub tuning', () => {
  it('resets only the fields with a known default', () => {
    expect(hubResetAll({ fileIoThreads: 16, cpuWorkers: 3, listingCacheSeconds: 300 })).toEqual({
      fileIoThreads: 8,
    });
    expect(HUB_ROWS.map((spec) => spec.field)).toEqual([
      'fileIoThreads',
      'cpuWorkers',
      'listingCacheSeconds',
    ]);
  });

  it('bounds file threads by the libuv maximum', () => {
    expect(hubProblemOf('fileIoThreads', '2000')).toBe('Node allows up to 1,024 file threads');
    expect(hubProblemOf('fileIoThreads', '0')).toBe('Use a whole number, 1 or more');
    expect(hubProblemOf('listingCacheSeconds', '0')).toBeNull();
  });
});
