import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { CLIENT_TOKEN, NODE_AI_TOKEN } from '@smarteverything/domain';
import { LOG_LEVELS, messageOf } from '@smarteverything/logging';
import { z } from 'zod';

export { OWNER_TOKEN_FILE } from '../server/access';

export const DATABASE_FILE = 'smarteverything.db';
export const SERVICE_CONFIG_FILE = 'service.json';
export const SERVICE_LOG_FILE = 'service.log';
export const SERVICE_OUTPUT_LOG_FILE = 'service-output.log';
export const NODE_WINDOW_FILE = 'node-window.json';
export const SERVICE_PID_FILE = 'service.pid';
export const SERVICE_READY_FILE = 'service-ready.json';
export const SUPERVISOR_PID_FILE = 'supervisor.pid';
export const RESTART_REQUEST_FILE = 'service-restart';
export const STOP_REQUEST_FILE = 'service-stop';
export const RESTART_EXIT_CODE = 75;
export const DATA_DIRECTORY_VARIABLE = 'SMARTEVERYTHING_DATA_DIRECTORY';
export const SUPERVISE_ARGUMENT = '--supervise';
const DEFAULT_SERVER_PORT = 7880;

export const SERVICE_ROLES = ['hub', 'node'] as const;

export type ServiceRole = (typeof SERVICE_ROLES)[number];

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
  role: z.literal('hub').default('hub'),
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

export const NODE_SERVICE_CONFIG = z.strictObject({
  role: z.literal('node'),
  logLevel: z.enum(LOG_LEVELS).default('info'),
  wakeDiagnostics: z.boolean().default(false),
  node: z.strictObject({
    hub_url: z.url({ protocol: /^https?$/ }),
    node_token: NODE_AI_TOKEN,
    device_id: z.uuid(),
    claude_executable: ABSOLUTE_PATH.optional(),
    codex_executable: ABSOLUTE_PATH.optional(),
    codex_control_socket: ABSOLUTE_PATH.optional(),
  }),
});
export const NODE_WINDOW = z.strictObject({
  hub_url: z.url({ protocol: /^https?$/ }),
  token: CLIENT_TOKEN,
});
export type HubServiceConfig = z.infer<typeof HUB_SERVICE_CONFIG>;
export type NodeServiceConfig = z.infer<typeof NODE_SERVICE_CONFIG>;
export type ServiceConfig = HubServiceConfig | NodeServiceConfig;

export const SERVICE_READY = z.strictObject({
  pid: z.int().positive(),
  url: z.url({ protocol: /^http$/ }),
  version: z.string().min(1),
});

export const NODE_SERVICE_READY = z.strictObject({
  role: z.literal('node'),
  pid: z.int().positive(),
  hub_url: z.url({ protocol: /^https?$/ }),
  device_id: z.uuid(),
  connected: z.boolean(),
  version: z.string().min(1),
});
export const RUNNING_SERVICE_READY = z.union([SERVICE_READY, NODE_SERVICE_READY]);
export type NodeServiceReady = z.infer<typeof NODE_SERVICE_READY>;
export type ServiceReady = z.infer<typeof RUNNING_SERVICE_READY>;

function loopbackOf(host: string): string {
  return host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
}

export function serviceUrl(
  config: Pick<HubServiceConfig, 'host' | 'port'> | NodeServiceConfig,
): string {
  if ('node' in config) return config.node.hub_url;
  const host = loopbackOf(config.host);
  return `http://${host.includes(':') ? `[${host}]` : host}:${String(config.port)}`;
}

class ServiceConfigError extends Error {
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

export function parseServiceConfigText(source: string, text: string): ServiceConfig {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new ServiceConfigError(source, `it is not JSON (${messageOf(error)})`);
  }
  const isNode =
    typeof json === 'object' && json !== null && 'role' in json && json.role === 'node';
  const parsed = (isNode ? NODE_SERVICE_CONFIG : HUB_SERVICE_CONFIG).safeParse(json);
  if (!parsed.success) {
    throw new ServiceConfigError(source, issuesOf(parsed.error));
  }
  return parsed.data;
}

export async function readServiceConfig(dataDirectory: string): Promise<ServiceConfig> {
  const path = join(dataDirectory, SERVICE_CONFIG_FILE);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new ServiceConfigError(path, messageOf(error));
  }
  return parseServiceConfigText(path, text);
}
