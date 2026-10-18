import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { MCP_TOKEN, hashMcpToken } from '@smarteverything/domain';
import { ClaudeFileReadError, ClaudeNotReadyError } from '../claude/errors';
import { dirname, join } from 'node:path';
import type { ClaudePrompt } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { systemClaudeCli } from '../claude/claude-cli';
import { helperCommand, linkLaunchOf } from '../claude/link-launch';
import { LinkPlane } from '../claude/link-plane';
import { claudeLocations } from '../claude/locations';
import { createClaudeHost } from '../claude/host';
import { ClaudeService } from '../claude/service';
import type { OwnerAlerts } from '../extensions/owner-alerts';
import { SERVICE_READY, SERVICE_READY_FILE } from '../service/configuration';
import type { Store } from '../store/store';
import type { RawRoute } from './http-server';
import type { ServerContext } from './context';
import { claudeLinkRoutes } from './handlers/claude-link';
import { isMissing } from '../fs-util';

export interface ClaudeWiring {
  readonly clock: Clock;
  readonly log: Logger;
  readonly store: Store;
  readonly dataDirectory: string;
  readonly alerts: OwnerAlerts;
}

export interface StartedClaude {
  readonly service: ClaudeService;
  readonly routes: readonly RawRoute[];
}

function promptPush(prompt: ClaudePrompt): Parameters<OwnerAlerts['raise']>[0] {
  return {
    title: `Claude needs you: ${prompt.tool_name}`,
    body: `${prompt.risk_reasons.join('; ')}. Answer it in the attached CLI session.`,
    data: { kind: 'claude_prompt', promptId: prompt.id, sessionId: prompt.session_id },
  };
}

async function readyUrl(dataDirectory: string): Promise<string> {
  const text = await readFile(join(dataDirectory, SERVICE_READY_FILE), 'utf8');
  return SERVICE_READY.parse(JSON.parse(text)).url;
}

export function startClaude(context: ServerContext, options: ClaudeWiring): StartedClaude {
  const log = options.log.forArea('hub.claude');
  const locations = claudeLocations();
  const launch = linkLaunchOf(options.dataDirectory);
  let localDeviceId: string | null = null;
  const plane = new LinkPlane({
    store: options.store,
    clock: options.clock,
    log,
    directory: join(options.dataDirectory, 'claude'),
    launch,
    cli: systemClaudeCli,
    readUrl: (): Promise<string> => readyUrl(options.dataDirectory),
    readMcp: (): ReturnType<typeof localMcp> => localMcp(options, localDeviceId),
    pluginsDirectory: join(dirname(locations.sessions), 'plugins'),
    raised: (prompt): void => {
      options.alerts.raise(promptPush(prompt));
    },
  });
  const service = new ClaudeService({
    locations,
    historyDirectory: join(options.dataDirectory, 'claude'),
    plane,
    clock: options.clock,
    publish: (notice): void => {
      context.live.announce(notice, notice.type === 'claude_thread' ? 'claude' : 'owners');
    },
    log,
  });
  context.computerAi.setLocalFactory((deviceId) => {
    localDeviceId = deviceId;
    try {
      retainLocalCredential(options.store, deviceId, join(options.dataDirectory, 'claude'));
    } catch (cause) {
      log.error('link.credential_unavailable', cause);
    }
    return createClaudeHost({
      service,
      plane,
      deviceId,
      dataDirectory: options.dataDirectory,
      log,
      settings: options.store.computerAi.settings(deviceId),
    });
  });
  service.start();
  return { service, routes: claudeLinkRoutes({ plane, log }) };
}

function retainLocalCredential(store: Store, deviceId: string, directory: string): void {
  const file = join(directory, 'link.token');
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return;
    throw new ClaudeFileReadError(file, cause);
  }
  const token = MCP_TOKEN.parse(text.trim());
  const hash = hashMcpToken(token);
  if (store.oauth.activePersonalTokenByHash(hash) === undefined) return;
  store.computerNativeMcpPolicy.bindLocal(deviceId, hash);
}

async function localMcp(
  options: ClaudeWiring,
  deviceId: string | null,
): Promise<{ url: string | null; headersCommand: string }> {
  if (deviceId === null)
    throw new ClaudeNotReadyError('mcp', 'The local native computer identity is not bound.');
  retainLocalCredential(options.store, deviceId, join(options.dataDirectory, 'claude'));
  const policy = options.store.computerNativeMcpPolicy.read({
    device_id: deviceId,
    runtime: 'claude',
  });
  const enabled = policy.enabled && policy.areas?.length !== 0;
  return {
    url: enabled ? new URL('/mcp', await readyUrl(options.dataDirectory)).toString() : null,
    headersCommand: helperCommand(linkLaunchOf(options.dataDirectory), 'headers'),
  };
}
