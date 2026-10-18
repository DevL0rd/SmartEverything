import { randomBytes, createHash } from 'node:crypto';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SESSION_AGENT_ADDRESS, SESSION_AGENT_FILE } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { AgentActions } from './agent-actions.js';
import { AgentServer } from './agent-server.js';

const log = new Logger('desktop.agent');
const SOCKET_FILE = 'session-agent.sock';
const PRIVATE_FILE = 0o600;
const PRIVATE_DIRECTORY = 0o700;
const TOKEN_BYTES = 32;

export function agentSocketPath(directory: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    const key = createHash('sha256').update(directory).digest('hex').slice(0, 16);
    return `\\\\.\\pipe\\smarteverything-agent-${key}`;
  }
  return join(directory, SOCKET_FILE);
}

export interface RunningAgent {
  readonly stop: () => Promise<void>;
}

export interface AgentHostOptions {
  readonly directory: string;
  readonly platform: NodeJS.Platform;
  readonly actions: AgentActions;
}

export async function startSessionAgent(options: AgentHostOptions): Promise<RunningAgent> {
  const { directory, platform } = options;
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const socket = agentSocketPath(directory, platform);
  const addressFile = join(directory, SESSION_AGENT_FILE);
  await mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY });
  await rm(addressFile, { force: true });
  if (platform !== 'win32') await rm(socket, { force: true });
  const server = new AgentServer(token, options.actions);
  await server.listen(socket);
  if (platform !== 'win32') await chmod(socket, PRIVATE_FILE);
  const address = SESSION_AGENT_ADDRESS.parse({ socket, token, pid: process.pid });
  await writeFile(addressFile, JSON.stringify(address), { mode: PRIVATE_FILE });
  log.info('agent.listening', { platform });
  return {
    stop: async (): Promise<void> => {
      await rm(addressFile, { force: true });
      await server.close();
      if (platform !== 'win32') await rm(socket, { force: true });
      log.info('agent.stopped', {});
    },
  };
}
