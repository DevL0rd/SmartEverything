import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { MCP_TOKEN, hashMcpToken } from '@smarteverything/domain';
import { ClaudeFileReadError, ClaudeNotReadyError } from '../claude/errors';
import { dirname, join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { systemClaudeCli } from '../claude/claude-cli';
import { helperCommand, linkLaunchOf } from '../claude/link-launch';
import { LinkPlane } from '../claude/link-plane';
import { claudeLocations } from '../claude/locations';
import { createClaudeHost } from '../claude/host';
import { ClaudeService } from '../claude/service';
import { hubClaudeSites, type ClaudeSites } from '../claude/sites';
import type { HubLayout } from '../data-layout';
import { SERVICE_READY } from '../service/configuration';
import type { Store } from '../store/store';
import type { RawRoute } from './http-server';
import type { ServerContext } from './context';
import { claudeLinkRoutes } from './handlers/claude-link';
import { isMissing } from '../fs-util';

export interface ClaudeWiring {
  readonly clock: Clock;
  readonly log: Logger;
  readonly store: Store;
  readonly layout: HubLayout;
}

export interface StartedClaude {
  readonly service: ClaudeService;
  readonly routes: readonly RawRoute[];
}

async function readyUrl(ready: string): Promise<string> {
  const text = await readFile(ready, 'utf8');
  return SERVICE_READY.parse(JSON.parse(text)).url;
}

export function startClaude(context: ServerContext, options: ClaudeWiring): StartedClaude {
  const log = options.log.forArea('hub.claude');
  const sites = hubClaudeSites(options.layout);
  const locations = claudeLocations(sites.home);
  const launch = linkLaunchOf(sites);
  let localDeviceId: string | null = null;
  const plane = new LinkPlane({
    store: options.store,
    clock: options.clock,
    log,
    directory: sites.directory,
    launch,
    cli: systemClaudeCli,
    readUrl: (): Promise<string> => readyUrl(sites.ready),
    readMcp: (): ReturnType<typeof localMcp> => localMcp(options, sites, localDeviceId),
    pluginsDirectory: join(dirname(locations.sessions), 'plugins'),
    raised: (): void => undefined,
  });
  const service = new ClaudeService({
    locations,
    historyDirectory: sites.directory,
    plane,
    clock: options.clock,
    publish: (notice): void => {
      if (notice.type === 'claude_status') context.live.announce(notice, 'owners');
    },
    log,
  });
  context.computerAi.setLocalFactory((deviceId) => {
    localDeviceId = deviceId;
    try {
      retainLocalCredential(options.store, deviceId, sites.directory);
    } catch (cause) {
      log.error('link.credential_unavailable', cause);
    }
    return createClaudeHost({
      service,
      plane,
      deviceId,
      sites,
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
  sites: ClaudeSites,
  deviceId: string | null,
): Promise<{ url: string | null; headersCommand: string }> {
  if (deviceId === null)
    throw new ClaudeNotReadyError('mcp', 'The local native computer identity is not bound.');
  retainLocalCredential(options.store, deviceId, sites.directory);
  const policy = options.store.computerNativeMcpPolicy.read({
    device_id: deviceId,
    runtime: 'claude',
  });
  const enabled = policy.enabled && policy.areas?.length !== 0;
  return {
    url: enabled ? new URL('/mcp', await readyUrl(sites.ready)).toString() : null,
    headersCommand: helperCommand(linkLaunchOf(sites), 'headers'),
  };
}
