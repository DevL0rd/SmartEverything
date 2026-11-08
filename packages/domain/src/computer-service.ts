import { z } from 'zod';
import { HUB_CONNECTION_METADATA } from './hub-connections';
import { CLIENT_TOKEN } from './api/access';
import { LOG_LEVELS } from './runtime-logs';
import { NODE_AI_TOKEN } from './node/ai-frames';

const WINDOWS_DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/u;
const WINDOWS_SHARE_ABSOLUTE = /^\\\\[^\\/]+[\\/][^\\/]+/u;

export function isAbsolutePath(path: string): boolean {
  return (
    path.startsWith('/') || WINDOWS_DRIVE_ABSOLUTE.test(path) || WINDOWS_SHARE_ABSOLUTE.test(path)
  );
}

const ABSOLUTE_PATH = z.string().refine(isAbsolutePath, { message: 'must be an absolute path' });
const SERVICE_URL = z.url({ protocol: /^https?$/ });

export const COMPUTER_LOG_LEVEL = z.enum([...LOG_LEVELS, 'none']);

export const COMPUTER_SERVICE_CONFIG = z.strictObject({
  logLevel: COMPUTER_LOG_LEVEL.default('info'),
  wakeDiagnostics: z.boolean().default(false),
  node: z.strictObject({
    hub_url: SERVICE_URL,
    node_token: NODE_AI_TOKEN,
    device_id: z.uuid(),
    claude_executable: ABSOLUTE_PATH.optional(),
    codex_executable: ABSOLUTE_PATH.optional(),
    codex_control_socket: ABSOLUTE_PATH.optional(),
  }),
});
export type ComputerServiceConfig = z.infer<typeof COMPUTER_SERVICE_CONFIG>;

export const COMPUTER_SERVICE_READY = z.strictObject({
  pid: z.int().positive(),
  hub_url: SERVICE_URL,
  device_id: z.uuid(),
  connected: z.boolean(),
  version: z.string().min(1),
});
export type ComputerServiceReady = z.infer<typeof COMPUTER_SERVICE_READY>;

export const COMPUTER_WINDOW_CONNECTION = z.strictObject({
  hub_url: SERVICE_URL,
  token: CLIENT_TOKEN,
  connection: z.exactOptional(HUB_CONNECTION_METADATA),
});
export type ComputerWindowConnection = z.infer<typeof COMPUTER_WINDOW_CONNECTION>;

export const COMPUTER_FILES = {
  config: 'service.json',
  ready: 'service-ready.json',
  serviceLog: 'service.log',
  serviceOutputLog: 'service-output.log',
  wakeDiagnostics: 'wake-diagnostics',
  servicePid: 'service.pid',
  supervisorPid: 'supervisor.pid',
  restartRequest: 'service-restart',
  stopRequest: 'service-stop',
  nodeWindow: 'node-window.json',
  nodeRoute: 'node-route.json',
  computerNodeId: 'computer-node.id',
  harness: 'harness',
  claudeHost: 'claude',
  codex: 'codex',
  codexInputs: 'codex/inputs',
  driveMountCache: 'drive-mounts',
  tmp: 'tmp',
} as const;

export function computerJournalCursorFile(deviceId: string): string {
  return `startup-journal-${z.uuid().parse(deviceId)}.cursor`;
}

export const COMPUTER_DATA_DIRECTORY_VARIABLE = 'SMARTEVERYTHING_COMPUTER_DIRECTORY';
export const COMPUTER_UNIT = 'smarteverything-node.service';
export const COMPUTER_LAUNCH_AGENT_LABEL = 'app.smarteverything.node';
export const COMPUTER_WINDOWS_RUN_VALUE = 'SmartEverything Node';
export const SUPERVISE_ARGUMENT = '--supervise';
export const RESTART_EXIT_CODE = 75;
