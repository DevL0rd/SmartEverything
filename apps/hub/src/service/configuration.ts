import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { LOG_LEVELS, messageOf } from '@smarteverything/logging';
import { z } from 'zod';

export { OWNER_TOKEN_FILE } from '../owner-token-file';

export const DATABASE_FILE = 'smarteverything.db';
export const SERVICE_CONFIG_FILE = 'service.json';
export const SERVICE_LOG_FILE = 'service.log';
export const SERVICE_OUTPUT_LOG_FILE = 'service-output.log';
export const SERVICE_PID_FILE = 'service.pid';
export const SERVICE_READY_FILE = 'service-ready.json';
export const SUPERVISOR_PID_FILE = 'supervisor.pid';
export const RESTART_REQUEST_FILE = 'service-restart';
export const STOP_REQUEST_FILE = 'service-stop';
export const RESTART_EXIT_CODE = 75;
export const DATA_DIRECTORY_VARIABLE = 'SMARTEVERYTHING_DATA_DIRECTORY';
export const SUPERVISE_ARGUMENT = '--supervise';
const DEFAULT_SERVER_PORT = 7880;

const ABSOLUTE_PATH = z.string().refine(isAbsolute, { message: 'must be an absolute path' });
const PORT = z.int().min(1).max(65_535);

const SERVICE_ENVIRONMENT = z.object({ [DATA_DIRECTORY_VARIABLE]: ABSOLUTE_PATH });

const HUB_SERVICE_CONFIG = z.strictObject({
  lan: z
    .strictObject({
      port: PORT.default(7882),
      host: z.union([z.ipv4(), z.ipv6()]).default('0.0.0.0'),
      advertise: z.boolean().default(true),
    })
    .optional(),
  port: PORT.default(DEFAULT_SERVER_PORT),
  host: z.string().min(1).default('0.0.0.0'),
  go2rtcBinary: ABSOLUTE_PATH,
  go2rtcApiPort: PORT.default(1984),
  webrtcPort: PORT.default(8555),
  logLevel: z.enum(LOG_LEVELS).default('info'),
  allowedOrigins: z.array(z.url()).min(1).optional(),
  codex_executable: ABSOLUTE_PATH.optional(),
  codex_control_socket: ABSOLUTE_PATH.optional(),
});

export type HubServiceConfig = z.infer<typeof HUB_SERVICE_CONFIG>;

export const SERVICE_READY = z.strictObject({
  pid: z.int().positive(),
  url: z.url({ protocol: /^http$/ }),
  version: z.string().min(1),
});

export type ServiceReady = z.infer<typeof SERVICE_READY>;

function loopbackOf(host: string): string {
  return host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
}

export function serviceUrl(config: Pick<HubServiceConfig, 'host' | 'port'>): string {
  const host = loopbackOf(config.host);
  return `http://${host.includes(':') ? `[${host}]` : host}:${String(config.port)}`;
}

export class ServiceConfigError extends Error {
  override readonly name = 'ServiceConfigError';

  constructor(
    readonly source: string,
    reason: string,
  ) {
    super(`The service configuration in ${source} is unusable: ${reason}.`);
  }
}

function issuesOf(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
    .join('; ');
}

export function dataDirectoryFrom(source: Readonly<Record<string, string | undefined>>): string {
  const parsed = SERVICE_ENVIRONMENT.safeParse(source);
  if (!parsed.success) {
    throw new ServiceConfigError('the environment', issuesOf(parsed.error));
  }
  return parsed.data[DATA_DIRECTORY_VARIABLE];
}

function serviceConfigJson(source: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ServiceConfigError(source, `it is not JSON (${messageOf(error)})`);
  }
}

export function parseServiceConfigText(source: string, text: string): HubServiceConfig {
  const parsed = HUB_SERVICE_CONFIG.safeParse(serviceConfigJson(source, text));
  if (!parsed.success) {
    throw new ServiceConfigError(source, issuesOf(parsed.error));
  }
  return parsed.data;
}

async function readConfigText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new ServiceConfigError(path, messageOf(error));
  }
}

export async function readServiceConfig(path: string): Promise<HubServiceConfig> {
  return parseServiceConfigText(path, await readConfigText(path));
}
