import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { HubLayout as DataLayout } from '../apps/hub/src/data-layout/index.ts';
import { schemaVersionOf } from './release-hub-files.ts';

import { HUB_STARTUP_DEADLINE_MS, HUB_UNIT } from '@smarteverything/domain';
import {
  HUB_NODE_EXECUTABLE,
  HUB_SERVICE_DIRECTORY,
  HUB_SERVICE_ENTRY,
  standaloneInstallProblem,
} from './hub-install-layout.ts';

const STARTED_EVENT = 'service.started';
const SCHEMA_FLAG = z.string().regex(/^\d+$/u, 'must be a whole number');
const STARTUP_FAILURE_EVENT =
  /^(?:store\.(?:migration_failed|backup_failed)|service\.start_failed)$/u;

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface Units {
  readonly restart: (unit: string) => void;
  readonly stop: (unit: string) => void;
  readonly start: (unit: string) => void;
  readonly isActive: (unit: string) => boolean;
  readonly activeSince: (unit: string) => Date | null;
}

function systemctl(args: readonly string[]): { readonly status: number; readonly text: string } {
  const result = spawnSync('systemctl', ['--user', ...args], { encoding: 'utf8' });
  return { status: result.status ?? 1, text: result.status === null ? '' : result.stdout.trim() };
}

function mustSucceed(verb: string, unit: string): void {
  const { status, text } = systemctl([verb, unit]);
  if (status !== 0)
    throw new Error(`systemctl --user ${verb} ${unit} failed (${String(status)}): ${text}`);
}

export function standaloneHubExecStart(install: string, value: string): boolean {
  const node = join(install, HUB_NODE_EXECUTABLE);
  const service = join(install, HUB_SERVICE_DIRECTORY, HUB_SERVICE_ENTRY);
  return value.startsWith(`{ path=${node} ; argv[]=${node} ${service} ;`);
}

export function assertStandaloneHubUnit(install: string): void {
  const problem = standaloneInstallProblem(install);
  if (problem !== undefined) throw new Error(problem);
  const unit = systemctl(['show', HUB_UNIT, '--property=ExecStart', '--value']);
  if (unit.status !== 0 || !standaloneHubExecStart(install, unit.text))
    throw new Error(`${HUB_UNIT} does not launch the standalone hub at ${install}.`);
}

export const systemdUnits: Units = {
  restart: (unit) => {
    mustSucceed('restart', unit);
  },
  stop: (unit) => {
    mustSucceed('stop', unit);
  },
  start: (unit) => {
    mustSucceed('start', unit);
  },
  isActive: (unit) => systemctl(['is-active', unit]).text === 'active',
  activeSince: (unit) => {
    const stamp = systemctl(['show', unit, '--property=ActiveEnterTimestamp', '--value']).text;
    return stamp === '' || Number.isNaN(Date.parse(stamp)) ? null : new Date(stamp);
  },
};

export function parseSchemaFlag(value: string | undefined): number | null {
  return value === undefined ? null : Number(SCHEMA_FLAG.parse(value));
}

const LOG_ENTRY = z.object({
  timestamp: z.string(),
  level: z.string(),
  event: z.string().optional(),
});

function logEntries(logFile: string): readonly z.infer<typeof LOG_ENTRY>[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .flatMap((line) => {
      if (!line.startsWith('{') || !line.endsWith('}')) return [];
      const parsed = LOG_ENTRY.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    });
}

function startupOutcome(logFile: string, since: Date): string | undefined {
  return logEntries(logFile)
    .filter((entry) => Date.parse(entry.timestamp) >= since.getTime())
    .map((entry) => entry.event ?? '')
    .find((event) => event === STARTED_EVENT || STARTUP_FAILURE_EVENT.test(event));
}

function nextStartupOutcome(logFile: string, since: Date): Promise<string> {
  return new Promise((resolve, reject) => {
    const watcher = watch(dirname(logFile), () => {
      check();
    });
    const timer = setTimeout(() => {
      watcher.close();
      reject(
        new Error(
          `the hub logged no startup event within ${String(HUB_STARTUP_DEADLINE_MS / 1000)} s`,
        ),
      );
    }, HUB_STARTUP_DEADLINE_MS);
    function check(): void {
      const outcome = startupOutcome(logFile, since);
      if (outcome === undefined) return;
      clearTimeout(timer);
      watcher.close();
      resolve(outcome);
    }
    check();
  });
}

export async function awaitHub(logFile: string, url: string, since: Date): Promise<void> {
  const outcome = await nextStartupOutcome(logFile, since);
  if (outcome !== STARTED_EVENT) throw new Error(`the hub failed to start: ${outcome}`);
  const status = await fetch(`${url}/privacy`).then(
    (response) => response.status,
    (cause: unknown) => String(cause),
  );
  if (status !== 200)
    throw new Error(`${url}/privacy answered ${String(status)} after the hub started`);
}

export function errorEventsSince(logFile: string, since: Date): readonly string[] {
  return logEntries(logFile)
    .filter(
      (entry) =>
        (entry.level === 'error' || entry.level === 'exception') &&
        Date.parse(entry.timestamp) >= since.getTime(),
    )
    .map((entry) => entry.event ?? 'unnamed');
}

async function deviceCount(url: string, token: string): Promise<Check> {
  const response = await fetch(`${url}/api/devices`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    return {
      name: 'owner API',
      ok: false,
      detail: `GET /api/devices answered ${String(response.status)}`,
    };
  const devices = z.array(z.unknown()).parse(await response.json());
  return { name: 'owner API', ok: true, detail: `${String(devices.length)} devices` };
}

export async function verifyHub(
  data: DataLayout,
  url: string,
  units: Units,
  expectedSchema: number | null,
): Promise<readonly Check[]> {
  const privacy = await fetch(`${url}/privacy`).then(
    (response) => response.status,
    () => 0,
  );
  const schema = schemaVersionOf(data.system.database.file);
  const since = units.activeSince(HUB_UNIT) ?? new Date(0);
  const failures = errorEventsSince(data.system.logs.service, since).filter((event) =>
    STARTUP_FAILURE_EVENT.test(event),
  );
  const token = readFileSync(data.system.keys.ownerToken, 'utf8').trim();
  return [
    { name: 'hub unit', ok: units.isActive(HUB_UNIT), detail: HUB_UNIT },
    { name: 'HTTP', ok: privacy === 200, detail: `GET /privacy answered ${String(privacy)}` },
    {
      name: 'schema',
      ok: expectedSchema === null || schema === expectedSchema,
      detail: `version ${String(schema)}${expectedSchema === null ? '' : `, expected ${String(expectedSchema)}`}`,
    },
    await deviceCount(url, token),
    {
      name: 'startup errors',
      ok: failures.length === 0,
      detail: failures.length === 0 ? 'none since the hub started' : failures.join(', '),
    },
  ];
}
