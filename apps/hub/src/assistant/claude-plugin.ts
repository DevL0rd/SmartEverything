import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { claudeProgram } from './executables';
import { runFile, type Runner } from './run';
import { claudeConfigDirectory } from './environment';
import { ProgramMissingError } from './executables';
import { ProgramError } from './run';

const MARKETPLACE = 'smarteverything-local';
const PLUGIN = 'smarteverything';
const PLUGIN_ID = `${PLUGIN}@${MARKETPLACE}`;
const DESCRIPTION =
  'Every SmartEverything tool in Claude Code, and requests from the SmartEverything AI chat and voice answered here.';

const PLUGINS = z.array(z.looseObject({ id: z.string(), enabled: z.boolean().optional() }));
const MARKETPLACES = z.array(z.looseObject({ name: z.string(), path: z.string().optional() }));

export interface PluginState {
  readonly cli: boolean;
  readonly marketplace: boolean;
  readonly path: string | null;
  readonly installed: boolean;
  readonly enabled: boolean;
}

export interface BridgeLaunch {
  readonly command: string;
  readonly script: string;
  readonly dataDirectory: string;
}

export class PluginError extends Error {
  override readonly name = 'PluginError';
}

function pluginFiles(launch: BridgeLaunch): Readonly<Record<string, unknown>> {
  return {
    '.claude-plugin/marketplace.json': {
      name: MARKETPLACE,
      description: 'SmartEverything plugins generated on this computer',
      owner: { name: 'SmartEverything' },
      plugins: [{ name: PLUGIN, description: DESCRIPTION, source: `./${PLUGIN}` }],
    },
    [`${PLUGIN}/.claude-plugin/plugin.json`]: {
      name: PLUGIN,
      version: '1.0.0',
      description: DESCRIPTION,
      author: { name: 'DevL0rd' },
      keywords: ['smart home', 'assistant'],
    },
    [`${PLUGIN}/.mcp.json`]: {
      mcpServers: {
        smarteverything: {
          command: launch.command,
          args: [launch.script],
          env: { ELECTRON_RUN_AS_NODE: '1', SMARTEVERYTHING_DATA: launch.dataDirectory },
        },
      },
    },
  };
}

async function writeIfChanged(path: string, value: unknown): Promise<boolean> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const before = await readFile(path, 'utf8').catch(() => '');
  if (before === text) {
    return false;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(`${path}.tmp`, text, { mode: 0o600 });
  await rename(`${path}.tmp`, path);
  return true;
}

function lastJson(stdout: string): unknown {
  const text = stdout.trim();
  return JSON.parse(text.startsWith('[') ? text : (text.split('\n').at(-1) ?? '[]'));
}

async function claudeJson(args: readonly string[], run: Runner): Promise<unknown> {
  const claude = await claudeProgram();
  const { stdout } = await run(claude.command, [...claude.args, ...args, '--json'], {
    timeoutMs: 60_000,
  });
  return lastJson(stdout);
}

export async function runClaude(args: readonly string[], run: Runner = runFile): Promise<void> {
  const claude = await claudeProgram();
  await run(claude.command, [...claude.args, ...args], { timeoutMs: 120_000 });
}

export async function pluginState(run: Runner = runFile): Promise<PluginState> {
  try {
    const [plugins, marketplaces] = await Promise.all([
      claudeJson(['plugin', 'list'], run).then((value) => PLUGINS.parse(value)),
      claudeJson(['plugin', 'marketplace', 'list'], run).then((value) => MARKETPLACES.parse(value)),
    ]);
    const installed = plugins.find((item) => item.id === PLUGIN_ID);
    const listed = marketplaces.find((item) => item.name === MARKETPLACE);
    return {
      cli: true,
      marketplace: listed !== undefined,
      path: listed?.path ?? null,
      installed: installed !== undefined,
      enabled: installed !== undefined && installed.enabled !== false,
    };
  } catch (cause) {
    if (!(
      cause instanceof ProgramMissingError ||
      cause instanceof ProgramError ||
      cause instanceof z.ZodError ||
      cause instanceof SyntaxError
    )) {
      throw cause;
    }
    return { cli: false, marketplace: false, path: null, installed: false, enabled: false };
  }
}

async function backup(backups: string): Promise<void> {
  const plugins = join(claudeConfigDirectory(), 'plugins');
  const stamp = String(Date.now());
  await mkdir(backups, { recursive: true, mode: 0o700 });
  for (const name of ['known_marketplaces.json', 'installed_plugins.json']) {
    await copyFile(join(plugins, name), join(backups, `${stamp}-${name}`)).catch(() => undefined);
  }
}

async function register(
  root: string,
  before: PluginState,
  changed: boolean,
  run: Runner,
): Promise<void> {
  if (!before.marketplace) {
    await runClaude(['plugin', 'marketplace', 'add', root, '--scope', 'user'], run);
  } else if (changed) {
    await runClaude(['plugin', 'marketplace', 'update', MARKETPLACE], run);
  }
  if (!before.installed) {
    await runClaude(['plugin', 'install', PLUGIN_ID, '--scope', 'user'], run);
  } else if (changed) {
    await runClaude(['plugin', 'update', PLUGIN_ID], run);
  }
  if (before.installed && !before.enabled) {
    await runClaude(['plugin', 'enable', PLUGIN_ID], run);
  }
}

export async function removePlugin(run: Runner = runFile): Promise<void> {
  const state = await pluginState(run);
  if (state.installed) {
    await runClaude(['plugin', 'uninstall', PLUGIN_ID], run);
  }
  if (state.marketplace) {
    await runClaude(['plugin', 'marketplace', 'remove', MARKETPLACE], run);
  }
}

export async function installPlugin(
  root: string,
  launch: BridgeLaunch,
  backups: string,
  run: Runner = runFile,
): Promise<void> {
  let changed = false;
  for (const [path, value] of Object.entries(pluginFiles(launch))) {
    changed = (await writeIfChanged(join(root, path), value)) || changed;
  }
  let before = await pluginState(run);
  if (!before.cli) {
    throw new PluginError(
      'Claude Code is not installed or not signed in. Install it, run claude once, then try again.',
    );
  }
  await backup(backups);
  if (before.path !== null && resolve(before.path) !== resolve(root)) {
    await removePlugin(run);
    before = await pluginState(run);
  }
  await register(root, before, changed, run);
  const after = await pluginState(run);
  if (!after.installed || !after.enabled) {
    throw new PluginError(
      'Claude did not report the SmartEverything plugin as installed and enabled.',
    );
  }
}
