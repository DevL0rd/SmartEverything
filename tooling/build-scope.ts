import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { HUB_UNIT } from '@smarteverything/domain';
import { z } from 'zod';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';

export type BuildKind = 'hub' | 'ui' | 'app' | 'desktop';

export const BUILD_MEMORY_LIMIT_ENV = 'SMARTEVERYTHING_BUILD_MEMORY_LIMIT';
export const BUILD_KIND_ENV = 'SMARTEVERYTHING_BUILD_KIND';
export const OOM_KILLED_STATUS = 137;

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

export const OS_RESERVE_BYTES = GIB;
export const MINIMUM_BUILD_MEMORY_BYTES = 2 * GIB;
export const TYPE_CHECK_HEAP_BYTES = 6 * GIB;
export const BUILD_OOM_SCORE_ADJUST = 1000;
export const HUB_HIGH_WATER_FILE = 'hub-memory-high-water.json';
export const GRADLE_CLIENT_METASPACE = '2g';
export const BYTES_PER_GRADLE_WORKER = 3 * GIB;

interface Plan {
  readonly nodeFraction: number;
  readonly gradleFraction: number;
}

export const MEMORY_PLANS: Readonly<Record<BuildKind, Plan>> = {
  hub: { nodeFraction: 0.6, gradleFraction: 0 },
  ui: { nodeFraction: 0.5, gradleFraction: 0 },
  desktop: { nodeFraction: 0.5, gradleFraction: 0 },
  app: { nodeFraction: 0.3, gradleFraction: 0.3 },
};

export class BuildScopeError extends Error {
  override readonly name: string = 'BuildScopeError';
}

export class BuildHubMemoryError extends BuildScopeError {
  override readonly name: string = 'BuildHubMemoryError';

  constructor(kind: BuildKind, currentBytes: number, shareBytes: number) {
    super(
      `The ${kind} build did not start because the hub already uses ${String(Math.ceil(currentBytes / MIB))} MiB, more than the ${String(Math.floor(shareBytes / MIB))} MiB it may use while this build runs. Starting it could make the system stop the hub. Let the hub settle or restart it, then run the build again.`,
    );
  }
}

export class BuildMemoryLimitError extends BuildScopeError {
  override readonly name: string = 'BuildMemoryLimitError';

  constructor(kind: BuildKind, limitBytes: number) {
    super(
      `The ${kind} build was stopped because it needed more than its memory limit of ${String(Math.floor(limitBytes / MIB))} MiB. ` +
        'The limit keeps the hub running: the machine memory minus the hub working set and the system reserve. Nothing else was affected.',
    );
  }
}

export interface MemoryMeasurement {
  readonly totalBytes: number;
  readonly hubPeakBytes: number;
  readonly hubCurrentBytes: number;
  readonly hubHighWaterBytes: number;
}

export function neededBuildBytes(kind: BuildKind): number {
  const plan = MEMORY_PLANS[kind];
  return kind === 'hub'
    ? Math.ceil(TYPE_CHECK_HEAP_BYTES / plan.nodeFraction)
    : MINIMUM_BUILD_MEMORY_BYTES;
}

export function hubShareBytes(totalBytes: number, kind: BuildKind): number {
  return totalBytes - OS_RESERVE_BYTES - neededBuildBytes(kind);
}

export interface BuildScope {
  readonly kind: BuildKind;
  readonly limitBytes: number;
  readonly command: (
    program: string,
    args: readonly string[],
  ) => { readonly program: string; readonly args: readonly string[] };
}

export function buildMemoryLimit(measurement: MemoryMeasurement, kind: BuildKind): number {
  const share = hubShareBytes(measurement.totalBytes, kind);
  if (measurement.hubCurrentBytes > share)
    throw new BuildHubMemoryError(kind, measurement.hubCurrentBytes, share);
  const hub = Math.max(
    measurement.hubPeakBytes,
    measurement.hubHighWaterBytes,
    measurement.hubCurrentBytes,
  );
  const limit = measurement.totalBytes - hub - OS_RESERVE_BYTES;
  if (limit < MINIMUM_BUILD_MEMORY_BYTES)
    throw new BuildScopeError(
      `This machine has too little memory to build beside the hub: ${String(Math.floor(measurement.totalBytes / MIB))} MiB in total, ${String(Math.floor(hub / MIB))} MiB kept for the hub and ${String(Math.floor(OS_RESERVE_BYTES / MIB))} MiB for the system leave ${String(Math.floor(limit / MIB))} MiB, and a build needs at least ${String(Math.floor(MINIMUM_BUILD_MEMORY_BYTES / MIB))} MiB.`,
    );
  return Math.floor(limit / MIB) * MIB;
}

export function parseMemTotal(meminfo: string): number {
  const match = /^MemTotal:\s+(\d+) kB$/mu.exec(meminfo);
  if (match?.[1] === undefined) throw new BuildScopeError('/proc/meminfo has no MemTotal line.');
  return Number(match[1]) * 1024;
}

const UNIT_VALUE = /^(MemoryPeak|MemoryCurrent|MainPID)=(.*)$/u;

export interface UnitMemory {
  readonly hubPeakBytes: number;
  readonly hubCurrentBytes: number;
  readonly mainPid: number;
}

export function parseUnitMemory(show: string): UnitMemory {
  const values = new Map<string, number>();
  for (const line of show.split('\n')) {
    const match = UNIT_VALUE.exec(line.trim());
    const [, name, text] = match ?? [];
    const value = Number(text);
    if (name !== undefined && Number.isSafeInteger(value)) values.set(name, value);
  }
  return {
    hubPeakBytes: values.get('MemoryPeak') ?? 0,
    hubCurrentBytes: values.get('MemoryCurrent') ?? 0,
    mainPid: values.get('MainPID') ?? 0,
  };
}

export function parseHighWater(status: string): number {
  const match = /^VmHWM:\s+(\d+) kB$/mu.exec(status);
  return match?.[1] === undefined ? 0 : Number(match[1]) * 1024;
}

const RECORDED_HIGH_WATER = z.strictObject({ bytes: z.number().int().nonnegative() });

export function highWaterFile(layout: Pick<HubLayout, 'cache'>): string {
  return join(layout.cache.buildHost, HUB_HIGH_WATER_FILE);
}

export function readRecordedHighWater(file: string): number {
  try {
    return RECORDED_HIGH_WATER.parse(JSON.parse(readFileSync(file, 'utf8'))).bytes;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 0;
    throw error;
  }
}

export function recordHighWater(file: string, bytes: number): void {
  mkdirSync(join(file, '..'), { recursive: true });
  const staged = `${file}.${String(process.pid)}`;
  writeFileSync(staged, `${JSON.stringify({ bytes })}\n`);
  renameSync(staged, file);
}

export function measureMemory(layout: Pick<HubLayout, 'cache'>): MemoryMeasurement {
  const shown = spawnSync(
    'systemctl',
    ['--user', 'show', HUB_UNIT, '-p', 'MemoryPeak', '-p', 'MemoryCurrent', '-p', 'MainPID'],
    { encoding: 'utf8' },
  );
  if (shown.error !== undefined)
    throw new BuildScopeError(`systemctl could not measure the hub: ${shown.error.message}`);
  const { mainPid, ...unit } = parseUnitMemory(shown.stdout);
  const file = highWaterFile(layout);
  const live =
    mainPid > 0 ? parseHighWater(readFileSync(`/proc/${String(mainPid)}/status`, 'utf8')) : 0;
  const hubHighWaterBytes = Math.max(readRecordedHighWater(file), live);
  if (hubHighWaterBytes > 0) recordHighWater(file, hubHighWaterBytes);
  return {
    totalBytes: parseMemTotal(readFileSync('/proc/meminfo', 'utf8')),
    ...unit,
    hubHighWaterBytes,
  };
}

export function nodeHeapMiB(kind: BuildKind, limitBytes: number): number {
  return Math.floor((limitBytes * MEMORY_PLANS[kind].nodeFraction) / MIB);
}

export function gradleHeapMiB(limitBytes: number): number {
  return Math.floor((limitBytes * MEMORY_PLANS.app.gradleFraction) / MIB);
}

export function gradleWorkers(limitBytes: number, cpus: number): number {
  return Math.max(1, Math.min(cpus, Math.floor(limitBytes / BYTES_PER_GRADLE_WORKER)));
}

export function nodeOptionsWith(
  existing: string | undefined,
  kind: BuildKind,
  limit: number,
): string {
  const heap = `--max-old-space-size=${String(nodeHeapMiB(kind, limit))}`;
  return [...(existing ?? '').split(/\s+/u).filter((part) => part !== ''), heap].join(' ');
}

function property(flag: '-D' | '-P', name: string, value: string): string {
  return `${flag}${name}=${value}`;
}

export function gradleMemoryArguments(
  environment: Readonly<Record<string, string | undefined>>,
  cpus: number = availableParallelism(),
): readonly string[] {
  const limit = environment[BUILD_MEMORY_LIMIT_ENV];
  if (limit === undefined) return [];
  const bytes = z.coerce.number().int().positive().parse(limit);
  return [
    '--no-daemon',
    `--max-workers=${String(gradleWorkers(bytes, cpus))}`,
    property(
      '-D',
      'org.gradle.jvmargs',
      `-Xmx${String(gradleHeapMiB(bytes))}m -XX:MaxMetaspaceSize=${GRADLE_CLIENT_METASPACE}`,
    ),
    property('-P', 'kotlin.compiler.execution.strategy', 'in-process'),
  ];
}

export const RAISE_OOM_SCORE = `echo ${String(BUILD_OOM_SCORE_ADJUST)} > /proc/self/oom_score_adj && exec "$@"`;

export interface ScopeRequest {
  readonly kind: BuildKind;
  readonly limitBytes: number;
  readonly existingNodeOptions: string | undefined;
  readonly unit: string;
}

export function scopeCommand(
  request: ScopeRequest,
  program: string,
  args: readonly string[],
): { readonly program: string; readonly args: readonly string[] } {
  const { kind, limitBytes, existingNodeOptions, unit } = request;
  return {
    program: 'systemd-run',
    args: [
      '--user',
      '--scope',
      '--quiet',
      '--collect',
      `--unit=${unit}`,
      `--description=SmartEverything ${kind} build`,
      '-p',
      `MemoryMax=${String(limitBytes)}`,
      '-p',
      'MemorySwapMax=0',
      '-p',
      'OOMPolicy=kill',
      `--setenv=${BUILD_MEMORY_LIMIT_ENV}=${String(limitBytes)}`,
      `--setenv=${BUILD_KIND_ENV}=${kind}`,
      `--setenv=NODE_OPTIONS=${nodeOptionsWith(existingNodeOptions, kind, limitBytes)}`,
      '--',
      'sh',
      '-c',
      RAISE_OOM_SCORE,
      'sh',
      program,
      ...args,
    ],
  };
}

export function measuredBuildScope(kind: BuildKind, layout: Pick<HubLayout, 'cache'>): BuildScope {
  const limitBytes = buildMemoryLimit(measureMemory(layout), kind);
  return {
    kind,
    limitBytes,
    command: (program, args) =>
      scopeCommand(
        {
          kind,
          limitBytes,
          existingNodeOptions: env['NODE_OPTIONS'],
          unit: `smarteverything-build-${kind}-${String(process.pid)}-${String(Date.now())}`,
        },
        program,
        args,
      ),
  };
}

export function insideBuildScope(): boolean {
  return env[BUILD_MEMORY_LIMIT_ENV] !== undefined;
}

export function killedByLimit(status: number | null, signal: NodeJS.Signals | null): boolean {
  return status === OOM_KILLED_STATUS || signal === 'SIGKILL';
}

function scopeOrSettle(
  kind: BuildKind,
  layout: Pick<HubLayout, 'cache'>,
  settle: (error: BuildScopeError) => void,
): BuildScope {
  try {
    return measuredBuildScope(kind, layout);
  } catch (error) {
    if (error instanceof BuildScopeError) settle(error);
    throw error;
  }
}

export function runInBuildScope(
  kind: BuildKind,
  layout: Pick<HubLayout, 'cache'>,
  settle: (error: BuildScopeError) => void,
): number | null {
  if (insideBuildScope()) return null;
  const scope = scopeOrSettle(kind, layout, settle);
  const launch = scope.command(process.execPath, [...process.execArgv, ...process.argv.slice(1)]);
  const result = spawnSync(launch.program, [...launch.args], { stdio: 'inherit' });
  if (result.error !== undefined)
    throw new BuildScopeError(
      `The ${kind} build could not start its memory scope: ${result.error.message}`,
    );
  if (killedByLimit(result.status, result.signal)) {
    const error = new BuildMemoryLimitError(kind, scope.limitBytes);
    settle(error);
    throw error;
  }
  return result.status ?? 1;
}
