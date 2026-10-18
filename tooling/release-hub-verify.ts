import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { schemaVersionOf, type HubLayout } from './release-hub-files.ts';

export const HUB_UNIT = 'smarteverything.service';
export const NODE_UNIT = 'smarteverything-node.service';

const SERVICE_LOG = 'service.log';
const OWNER_TOKEN_FILE = 'owner-token';
const READY_DEADLINE_MS = 120_000;
const READY_RETRY_MS = 1000;
const STARTUP_FAILURE_EVENT = /^(?:store\.(?:migration_failed|backup_failed)|hub\.start_failed)/u;

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
  return { status: result.status ?? 1, text: result.stdout.trim() };
}

function mustSucceed(verb: string, unit: string): void {
  const { status, text } = systemctl([verb, unit]);
  if (status !== 0)
    throw new Error(`systemctl --user ${verb} ${unit} failed (${String(status)}): ${text}`);
}

export const systemdUnits: Units = {
  restart: (unit) => mustSucceed('restart', unit),
  stop: (unit) => mustSucceed('stop', unit),
  start: (unit) => mustSucceed('start', unit),
  isActive: (unit) => systemctl(['is-active', unit]).text === 'active',
  activeSince: (unit) => {
    const stamp = systemctl(['show', unit, '--property=ActiveEnterTimestamp', '--value']).text;
    return stamp === '' || Number.isNaN(Date.parse(stamp)) ? null : new Date(stamp);
  },
};

export async function awaitHub(url: string): Promise<void> {
  const deadline = Date.now() + READY_DEADLINE_MS;
  for (;;) {
    const reached = await fetch(`${url}/privacy`).then(
      (response) => response.ok,
      () => false,
    );
    if (reached) return;
    if (Date.now() > deadline)
      throw new Error(`${url} did not answer within ${String(READY_DEADLINE_MS / 1000)} s`);
    await new Promise((resolve) => setTimeout(resolve, READY_RETRY_MS));
  }
}

export function errorEventsSince(logFile: string, since: Date): readonly string[] {
  const entry = z.object({
    timestamp: z.string(),
    level: z.string(),
    event: z.string().optional(),
  });
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .flatMap((line) => {
      if (!line.includes('"level":"error"')) return [];
      const parsed = entry.safeParse(JSON.parse(line));
      return parsed.success &&
        parsed.data.level === 'error' &&
        Date.parse(parsed.data.timestamp) >= since.getTime()
        ? [parsed.data.event ?? 'unnamed']
        : [];
    });
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
  return { name: 'owner API', ok: devices.length > 0, detail: `${String(devices.length)} devices` };
}

export async function verifyHub(
  layout: HubLayout,
  url: string,
  units: Units,
  expectedSchema: number | null,
): Promise<readonly Check[]> {
  const privacy = await fetch(`${url}/privacy`).then(
    (response) => response.status,
    () => 0,
  );
  const schema = schemaVersionOf(layout.database);
  const since = units.activeSince(HUB_UNIT) ?? new Date(0);
  const failures = errorEventsSince(join(layout.data, SERVICE_LOG), since).filter((event) =>
    STARTUP_FAILURE_EVENT.test(event),
  );
  const token = readFileSync(join(layout.data, OWNER_TOKEN_FILE), 'utf8').trim();
  return [
    { name: 'hub unit', ok: units.isActive(HUB_UNIT), detail: HUB_UNIT },
    { name: 'node unit', ok: units.isActive(NODE_UNIT), detail: NODE_UNIT },
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
