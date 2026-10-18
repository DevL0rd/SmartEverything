import { env } from 'node:process';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  displayEnvironment,
  LinuxDisplays,
  type DisplayEnvironment,
} from '../../../src/node/controls/linux/linux-displays';
import { DisplayRevert, systemSchedule } from '../../../src/node/controls/linux/display-revert';
import { spawnLines } from '../../../src/node/controls/linux/line-stream';
import { KwinNightLight } from '../../../src/node/controls/linux/night-light';
import { cachedProbe, programAvailable } from '../../../src/node/controls/linux/program-probe';
import { PulseAudio } from '../../../src/node/controls/linux/pulse-audio';
import { runProgram, type RunProgram } from '../../../src/node/run-program';

const LIVE = z.object({ SMARTEVERYTHING_LIVE_READONLY: z.string().optional() });

const ENABLED = LIVE.parse(env).SMARTEVERYTHING_LIVE_READONLY === '1';

const READ_ONLY: ReadonlySet<string> = new Set([
  '-f json info',
  '-f json list sinks',
  '-f json list sources',
  '-f json list sink-inputs',
  '-f json list source-outputs',
  '-j',
  'detect --brief',
]);

const readOnly: RunProgram = (file, args) => {
  if (!READ_ONLY.has(args.join(' '))) {
    return Promise.reject(
      new Error(`live read-only test refuses to run: ${file} ${args.join(' ')}`),
    );
  }
  return runProgram(file, args);
};

describe.skipIf(!ENABLED)('this computer, read-only (set SMARTEVERYTHING_LIVE_READONLY=1)', () => {
  it('reads the real audio state', async () => {
    const audio = new PulseAudio({
      run: readOnly,
      probe: cachedProbe(programAvailable),
      lines: spawnLines,
      failed: (cause: unknown): never => {
        throw cause;
      },
    });
    const state = await audio.read();
    expect(state.outputs.length).toBeGreaterThan(0);
  });

  it('reads the real display layout', async () => {
    const displays = new LinuxDisplays({
      run: readOnly,
      probe: cachedProbe(programAvailable),
      lines: spawnLines,
      environment: (): DisplayEnvironment => displayEnvironment(true),
      nightLight: new KwinNightLight(() => {
        throw new Error('no bus');
      }, readOnly),
      notice: { show: (): Promise<never> => Promise.reject(new Error('read-only')) },
      revert: new DisplayRevert({
        now: (): Date => new Date(),
        schedule: systemSchedule,
        token: (): string => 'x',
      }),
      schedule: systemSchedule,
      failed: (cause: unknown): never => {
        throw cause;
      },
    });
    const state = await displays.read();
    expect(state.outputs.length).toBeGreaterThan(0);
    expect(state.pendingRevert).toBeNull();
  });
});
