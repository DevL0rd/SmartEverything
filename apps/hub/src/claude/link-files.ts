import { createHash } from 'node:crypto';
import { helperCommand, type LinkLaunch } from './link-launch';
import { MOD_FILE, modSource } from './link-mod';
import { PROMPT_HOLD_MS } from './link-paths';

export const MARKETPLACE = 'smarteverything-local';

const PLUGIN = 'smarteverything';

export const PLUGIN_ID = `${PLUGIN}@${MARKETPLACE}`;

const HOOK_TIMEOUT_SECONDS = PROMPT_HOLD_MS / 1000 + 10;

const OBSERVER_TIMEOUT_SECONDS = 10;

const VERSION_BASE = '2.0.0';

const VERSION_DIGITS = 12;

const DESCRIPTION =
  'SmartEverything link: scoped home tools, approvals and direct native tool access for attached Claude Code sessions.';

export interface LinkFileFacts {
  readonly launch: LinkLaunch;
  readonly url: string;
  readonly mcp?: { readonly url: string | null; readonly headersCommand: string };
}

function commandHook(
  launch: LinkLaunch,
  subcommand: 'hook' | 'observe',
  extra: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    hooks: [{ type: 'command', command: helperCommand(launch, subcommand), ...extra }],
  };
}

function hookTable(launch: LinkLaunch): Readonly<Record<string, unknown>> {
  const held = { timeout: HOOK_TIMEOUT_SECONDS };
  const observed = { timeout: OBSERVER_TIMEOUT_SECONDS, async: true };
  return {
    hooks: {
      PermissionRequest: [commandHook(launch, 'hook', held)],
      PreToolUse: [{ matcher: 'AskUserQuestion', ...commandHook(launch, 'hook', held) }],
      Notification: [commandHook(launch, 'observe', observed)],
      Stop: [commandHook(launch, 'observe', observed)],
      SessionStart: [commandHook(launch, 'observe', observed)],
    },
  };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function pluginPath(path: string): string {
  return `${PLUGIN}/${path}`;
}

function versionOf(files: Readonly<Record<string, string>>): string {
  const hash = createHash('sha256');
  for (const [path, text] of Object.entries(files).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    hash.update(`${path}\0${text}\0`);
  }
  return `${VERSION_BASE}-h${hash.digest('hex').slice(0, VERSION_DIGITS)}`;
}

function contentFiles(facts: LinkFileFacts): Readonly<Record<string, string>> {
  return {
    '.claude-plugin/marketplace.json': json({
      name: MARKETPLACE,
      description: 'SmartEverything plugins generated on this computer',
      owner: { name: 'SmartEverything' },
      plugins: [{ name: PLUGIN, description: DESCRIPTION, source: `./${PLUGIN}` }],
    }),
    [pluginPath('hooks/hooks.json')]: json({ modules: [`./${MOD_FILE}`] }),
    [pluginPath('hooks/commands.json')]: json(hookTable(facts.launch)),
    [pluginPath(`hooks/${MOD_FILE}`)]: modSource(facts.launch),
    [pluginPath('.mcp.json')]: json({
      mcpServers:
        facts.mcp?.url === null
          ? {}
          : {
              [PLUGIN]: {
                type: 'http',
                url: facts.mcp?.url ?? `${facts.url}/mcp`,
                headersHelper: facts.mcp?.headersCommand ?? helperCommand(facts.launch, 'headers'),
              },
            },
    }),
  };
}

export interface LinkFiles {
  readonly version: string;
  readonly files: Readonly<Record<string, string>>;
}

export function linkFiles(facts: LinkFileFacts): LinkFiles {
  const content = contentFiles(facts);
  const version = versionOf(content);
  return {
    version,
    files: {
      ...content,
      [pluginPath('.claude-plugin/plugin.json')]: json({
        name: PLUGIN,
        version,
        description: DESCRIPTION,
        author: { name: 'DevL0rd' },
        keywords: ['smart home', 'assistant'],
        hooks: './hooks/commands.json',
      }),
    },
  };
}

export function pluginContents(
  files: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const prefix = `${PLUGIN}/`;
  return Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, text]) => [path.slice(prefix.length), text]),
  );
}
