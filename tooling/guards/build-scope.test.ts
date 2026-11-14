import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';
import { describe, expect, it } from 'vitest';
import {
  BUILD_KIND_ENV,
  BUILD_MEMORY_LIMIT_ENV,
  BuildMemoryLimitError,
  BuildScopeError,
  BuildHubMemoryError,
  BUILD_OOM_SCORE_ADJUST,
  RAISE_OOM_SCORE,
  TYPE_CHECK_HEAP_BYTES,
  MEMORY_PLANS,
  OS_RESERVE_BYTES,
  buildMemoryLimit,
  gradleHeapMiB,
  gradleMemoryArguments,
  gradleWorkers,
  hubShareBytes,
  HUB_HIGH_WATER_FILE,
  parseHighWater,
  readRecordedHighWater,
  recordHighWater,
  killedByLimit,
  nodeHeapMiB,
  nodeOptionsWith,
  parseMemTotal,
  parseUnitMemory,
  scopeCommand,
} from '../build-scope.ts';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

const NAS = {
  totalBytes: 16102880 * 1024,
  hubPeakBytes: 2996506624,
  hubCurrentBytes: 1932632064,
  hubHighWaterBytes: 1724240 * 1024,
};

describe('the memory limit of a build', () => {
  it('is the machine memory minus the hub high-water mark and the system reserve', () => {
    const limit = buildMemoryLimit(NAS, 'app');
    expect(limit).toBeGreaterThan(11.3 * GIB);
    expect(limit % MIB).toBe(0);
    expect(limit + NAS.hubPeakBytes + OS_RESERVE_BYTES).toBeLessThanOrEqual(NAS.totalBytes);
  });

  it('uses the larger of the unit peak, the recorded high-water mark and the current use', () => {
    const grown = buildMemoryLimit({ ...NAS, hubHighWaterBytes: 5.5 * GIB }, 'app');
    expect(grown + 5.5 * GIB + OS_RESERVE_BYTES).toBeLessThanOrEqual(NAS.totalBytes);
    expect(grown).toBeLessThan(buildMemoryLimit(NAS, 'app'));
    const current = buildMemoryLimit(
      { ...NAS, hubPeakBytes: 0, hubHighWaterBytes: 0, hubCurrentBytes: 4 * GIB },
      'app',
    );
    expect(current + 4 * GIB + OS_RESERVE_BYTES).toBeLessThanOrEqual(NAS.totalBytes);
  });

  it('survives a restart that resets the unit peak because the high-water mark is recorded', () => {
    const afterRestart = {
      ...NAS,
      hubPeakBytes: 0,
      hubCurrentBytes: 0.4 * GIB,
      hubHighWaterBytes: 5.5 * GIB,
    };
    expect(
      buildMemoryLimit(afterRestart, 'app') + 5.5 * GIB + OS_RESERVE_BYTES,
    ).toBeLessThanOrEqual(NAS.totalBytes);
  });

  it('refuses a machine with too little memory to build beside the hub', () => {
    expect(() => buildMemoryLimit({ ...NAS, totalBytes: 4 * GIB }, 'app')).toThrow(BuildScopeError);
  });

  it('refuses up front, by name, when the hub already uses more than its measured share', () => {
    const share = hubShareBytes(NAS.totalBytes, 'hub');
    expect(share).toBe(NAS.totalBytes - OS_RESERVE_BYTES - Math.ceil(TYPE_CHECK_HEAP_BYTES / 0.6));
    expect(() => buildMemoryLimit({ ...NAS, hubCurrentBytes: share + 1 }, 'hub')).toThrow(
      BuildHubMemoryError,
    );
    expect(() => buildMemoryLimit({ ...NAS, hubCurrentBytes: 5.5 * GIB }, 'hub')).toThrow(
      /hub already uses 5632 MiB/u,
    );
    expect(() => buildMemoryLimit({ ...NAS, hubCurrentBytes: 5.5 * GIB }, 'ui')).not.toThrow();
    expect(() => buildMemoryLimit({ ...NAS, hubCurrentBytes: share }, 'hub')).not.toThrow();
  });

  it('reads the machine total, the hub unit and the hub process measurements', () => {
    expect(parseMemTotal('MemTotal:       16102880 kB\nMemFree: 1 kB\n')).toBe(16102880 * 1024);
    expect(
      parseUnitMemory('MemoryCurrent=1932632064\nMemoryPeak=2996506624\nMainPID=30610\n'),
    ).toEqual({ hubPeakBytes: 2996506624, hubCurrentBytes: 1932632064, mainPid: 30610 });
    expect(parseUnitMemory('MemoryCurrent=[not set]\nMemoryPeak=[not set]\nMainPID=0\n')).toEqual({
      hubPeakBytes: 0,
      hubCurrentBytes: 0,
      mainPid: 0,
    });
    expect(parseHighWater('VmPeak:\t 9 kB\nVmHWM:\t 1724240 kB\nVmRSS:\t 920672 kB\n')).toBe(
      1724240 * 1024,
    );
    expect(() => parseMemTotal('nothing')).toThrow(BuildScopeError);
  });
});

describe('the recorded hub high-water mark', () => {
  it('is zero before anything is recorded and keeps what was recorded across restarts', () => {
    const folder = mkdtempSync(join(env['TMPDIR'] ?? '/var/tmp', 'high-water-'));
    try {
      const file = join(folder, HUB_HIGH_WATER_FILE);
      expect(readRecordedHighWater(file)).toBe(0);
      recordHighWater(file, 5.5 * GIB);
      expect(readRecordedHighWater(file)).toBe(5.5 * GIB);
      writeFileSync(file, '{"bytes":-1}');
      expect(() => readRecordedHighWater(file)).toThrow();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('the memory settings inside the scope', () => {
  const limit = buildMemoryLimit(NAS, 'hub');

  it('lets a hub type check use the 6 GiB measured for tsc and keeps every plan inside the limit', () => {
    expect(nodeHeapMiB('hub', limit)).toBeGreaterThan(6 * 1024);
    for (const plan of Object.values(MEMORY_PLANS)) {
      expect(plan.nodeFraction + plan.gradleFraction).toBeLessThanOrEqual(0.6);
    }
  });

  it('gives Gradle no daemon, a bounded heap, bounded workers and an in-process Kotlin compiler', () => {
    const args = gradleMemoryArguments({ [BUILD_MEMORY_LIMIT_ENV]: String(limit) }, 4);
    expect(args).toEqual([
      '--no-daemon',
      '--max-workers=3',
      `-Dorg.gradle.jvmargs=-Xmx${String(gradleHeapMiB(limit))}m -XX:MaxMetaspaceSize=512m`,
      '-Pkotlin.compiler.execution.strategy=in-process',
    ]);
    expect(gradleHeapMiB(limit)).toBeLessThan((limit * 0.35) / MIB);
    expect(gradleHeapMiB(limit) * MIB).toBeLessThan(6 * GIB);
  });

  it('does not touch Gradle on a machine without a build scope', () => {
    expect(gradleMemoryArguments({}, 4)).toEqual([]);
  });

  it('caps workers by processors and by memory', () => {
    expect(gradleWorkers(12 * GIB, 2)).toBe(2);
    expect(gradleWorkers(4 * GIB, 8)).toBe(1);
    expect(gradleWorkers(1 * GIB, 8)).toBe(1);
  });

  it('adds the node heap to existing node options', () => {
    expect(nodeOptionsWith('--trace-warnings', 'ui', limit)).toBe(
      `--trace-warnings --max-old-space-size=${String(nodeHeapMiB('ui', limit))}`,
    );
  });
});

describe('the transient scope', () => {
  it('runs the command outside the hub cgroup with a hard memory limit and no swap', () => {
    const launch = scopeCommand(
      { kind: 'app', limitBytes: 1000 * MIB, existingNodeOptions: undefined, unit: 'unit-1' },
      '/bin/node',
      ['a.ts', '{}'],
    );
    expect(launch.program).toBe('systemd-run');
    expect(launch.args).toEqual(
      expect.arrayContaining([
        '--user',
        '--scope',
        '--unit=unit-1',
        'MemoryMax=1048576000',
        'MemorySwapMax=0',
        'OOMPolicy=kill',
        `--setenv=${BUILD_MEMORY_LIMIT_ENV}=1048576000`,
        `--setenv=${BUILD_KIND_ENV}=app`,
      ]),
    );
    expect(launch.args.slice(-8)).toEqual([
      '--',
      'sh',
      '-c',
      RAISE_OOM_SCORE,
      'sh',
      '/bin/node',
      'a.ts',
      '{}',
    ]);
  });

  it('makes the kernel prefer killing the build over the hub', () => {
    const launch = scopeCommand(
      { kind: 'hub', limitBytes: 1000 * MIB, existingNodeOptions: undefined, unit: 'unit-2' },
      '/bin/node',
      [],
    );
    expect(BUILD_OOM_SCORE_ADJUST).toBeGreaterThan(0);
    expect(launch.args).toContain(RAISE_OOM_SCORE);
    expect(RAISE_OOM_SCORE).toBe(
      `echo ${String(BUILD_OOM_SCORE_ADJUST)} > /proc/self/oom_score_adj && exec "$@"`,
    );
    expect(launch.args).toContain('MemoryMax=1048576000');
  });

  it('names the limit when a build was killed by it', () => {
    expect(killedByLimit(137, null)).toBe(true);
    expect(killedByLimit(null, 'SIGKILL')).toBe(true);
    expect(killedByLimit(1, null)).toBe(false);
    const message = new BuildMemoryLimitError('app', 1000 * MIB).message;
    expect(message).toContain('app build was stopped');
    expect(message).toContain('1000 MiB');
  });
});
