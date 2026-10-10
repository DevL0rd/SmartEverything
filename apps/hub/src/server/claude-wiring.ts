import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ClaudePrompt } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { systemClaudeCli } from '../claude/claude-cli';
import { linkLaunchOf } from '../claude/link-launch';
import { LinkPlane } from '../claude/link-plane';
import { desktopStateOf } from '../claude/desktop-state';
import { claudeLocations } from '../claude/locations';
import { openUrl } from '../claude/open-url';
import { ClaudeService } from '../claude/service';
import type { OwnerAlerts } from '../extensions/owner-alerts';
import { SERVICE_READY, SERVICE_READY_FILE } from '../service/configuration';
import type { Store } from '../store/store';
import type { RawRoute } from './http-server';
import type { ServerContext } from './context';
import { claudeLinkRoutes } from './handlers/claude-link';

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
    body: `${prompt.risk_reasons.join('; ')}. Answer it in Claude Desktop.`,
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
  const plane = new LinkPlane({
    store: options.store,
    clock: options.clock,
    log,
    directory: join(options.dataDirectory, 'claude'),
    launch: linkLaunchOf(options.dataDirectory),
    cli: systemClaudeCli,
    readUrl: (): Promise<string> => readyUrl(options.dataDirectory),
    pluginsDirectory: join(dirname(locations.sessions), 'plugins'),
    open: openUrl,
    raised: (prompt): void => {
      options.alerts.raise(promptPush(prompt));
    },
    autoInstall: (): boolean => {
      const desktop = desktopStateOf(locations.desktop);
      return (
        options.store.assistantChat.settings().claude_link_auto &&
        (desktop === 'running' || desktop === 'not_running')
      );
    },
  });
  const service = new ClaudeService({
    locations,
    plane,
    clock: options.clock,
    publish: (notice): void => {
      context.live.announce(notice, notice.type === 'claude_thread' ? 'claude' : 'owners');
    },
    log,
  });
  service.start();
  plane.load().catch((cause: unknown) => {
    log.error('link.load_failed', cause);
  });
  return { service, routes: claudeLinkRoutes({ plane, log }) };
}
