import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { platform } from 'node:process';
import type { ClaudeLink as LinkStatus } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { ClaudeCli } from './claude-cli';
import { ClaudeLinkError, ClaudeNotReadyError } from './errors';
import { MARKETPLACE, PLUGIN_ID, linkFiles, pluginContents, type LinkFiles } from './link-files';
import type { LinkLaunch } from './link-launch';
import type { LinkCredential } from './link-token';

export type LinkState = LinkStatus['state'];

const LINK_FOLDER = 'link';

const PLUGINS = z.array(
  z.looseObject({
    id: z.string(),
    enabled: z.boolean().optional(),
    version: z.string().optional(),
    installPath: z.string().optional(),
  }),
);

const MARKETPLACES = z.array(z.looseObject({ name: z.string(), path: z.string().optional() }));

const BACKED_UP = ['known_marketplaces.json', 'installed_plugins.json'] as const;

export interface LinkOptions {
  readonly directory: string;
  readonly launch: LinkLaunch;
  readonly token: LinkCredential;
  readonly cli: ClaudeCli;
  readonly readUrl: () => Promise<string>;
  readonly readMcp?: () => Promise<{
    readonly url: string | null;
    readonly headersCommand: string;
  }>;
  readonly pluginsDirectory: string;
  readonly log: Logger;
  readonly changed: () => void;
}

interface Registered {
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly marketplace: boolean;
  readonly path: string | null;
  readonly version: string | null;
  readonly installPath: string | null;
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

function lastJson(stdout: string): unknown {
  const text = stdout.trim();
  return JSON.parse(text.startsWith('[') ? text : (text.split('\n').at(-1) ?? '[]'));
}

async function filesMatch(
  folder: string,
  expected: Readonly<Record<string, string>>,
): Promise<boolean> {
  for (const [path, text] of Object.entries(expected)) {
    const onDisk = await readFile(join(folder, path), 'utf8').catch((cause: unknown) => {
      if (!isMissing(cause)) {
        throw cause;
      }
      return null;
    });
    if (onDisk !== text) {
      return false;
    }
  }
  return true;
}

export class ClaudeLink {
  private known: LinkState = 'not_installed';

  constructor(private readonly options: LinkOptions) {}

  private get root(): string {
    return join(this.options.directory, LINK_FOLDER);
  }

  state(): LinkState {
    return this.known;
  }

  refresh(): Promise<LinkState> {
    return this.settle();
  }

  async install(): Promise<LinkState> {
    if (platform !== 'linux') {
      throw new ClaudeNotReadyError('link', 'the link is only supported on Linux');
    }
    const before = await this.registered();
    if ((await this.settle(before)) === 'installed') {
      return 'installed';
    }
    await this.options.token.ensure();
    const url = await this.options.readUrl();
    await this.writeFiles((await this.generated(url)).files);
    await this.backup();
    const misplaced =
      before.marketplace && before.path !== null && resolve(before.path) !== resolve(this.root);
    if (misplaced) {
      await this.unregister(before);
    }
    await this.register(misplaced ? await this.registered() : before);
    const after = await this.refresh();
    if (after !== 'installed') {
      throw new ClaudeLinkError('install', `Claude reports the link as ${after}`);
    }
    const retired = this.options.token.retireBridge();
    if (retired > 0) {
      this.options.log.info('link.old_token_retired', { tokens: retired });
    }
    return after;
  }

  async remove(): Promise<LinkState> {
    await this.unregister(await this.registered());
    await this.options.token.revoke();
    return this.refresh();
  }

  private async settle(known?: Registered): Promise<LinkState> {
    const next = await this.measure(known);
    this.set(next);
    return next;
  }

  private set(next: LinkState): void {
    if (next !== this.known) {
      this.known = next;
      this.options.log.info('link.state', { state: next });
      this.options.changed();
    }
  }

  private async measure(known?: Registered): Promise<LinkState> {
    if (platform !== 'linux') {
      return 'not_installed';
    }
    let registered: Registered;
    try {
      registered = known ?? (await this.registered());
    } catch (cause) {
      if (cause instanceof ClaudeNotReadyError) {
        return 'not_installed';
      }
      throw cause;
    }
    if (!registered.installed) {
      return 'not_installed';
    }
    const here = registered.path !== null && resolve(registered.path) === resolve(this.root);
    const sound = here && registered.enabled && (await this.current(registered));
    return sound ? 'installed' : 'needs_repair';
  }

  private async expected(): Promise<LinkFiles | null> {
    return (await this.options.token.read()) === null
      ? null
      : this.generated(await this.options.readUrl());
  }

  private async generated(url: string): Promise<LinkFiles> {
    const mcp = await this.options.readMcp?.();
    return linkFiles({ launch: this.options.launch, url, ...(mcp === undefined ? {} : { mcp }) });
  }

  private async current(registered: Registered): Promise<boolean> {
    const expected = await this.expected();
    const cached = registered.installPath;
    if (expected === null || cached === null || registered.version !== expected.version) {
      return false;
    }
    return (
      (await filesMatch(this.root, expected.files)) &&
      (await filesMatch(cached, pluginContents(expected.files)))
    );
  }

  private async registered(): Promise<Registered> {
    const [plugins, marketplaces] = await Promise.all([
      this.options.cli(['plugin', 'list', '--json']).then((out) => PLUGINS.parse(lastJson(out))),
      this.options
        .cli(['plugin', 'marketplace', 'list', '--json'])
        .then((out) => MARKETPLACES.parse(lastJson(out))),
    ]);
    const plugin = plugins.find((item) => item.id === PLUGIN_ID);
    const marketplace = marketplaces.find((item) => item.name === MARKETPLACE);
    return {
      installed: plugin !== undefined,
      enabled: plugin !== undefined && plugin.enabled !== false,
      marketplace: marketplace !== undefined,
      path: marketplace?.path ?? null,
      version: plugin?.version ?? null,
      installPath: plugin?.installPath ?? null,
    };
  }

  private async register(before: Registered): Promise<void> {
    const { cli } = this.options;
    if (!before.marketplace) {
      await cli(['plugin', 'marketplace', 'add', this.root, '--scope', 'user']);
    } else {
      await cli(['plugin', 'marketplace', 'update', MARKETPLACE]);
    }
    if (before.installed) {
      await cli(['plugin', 'uninstall', PLUGIN_ID]);
    }
    await cli(['plugin', 'install', PLUGIN_ID, '--scope', 'user']);
  }

  private async unregister(state: Registered): Promise<void> {
    if (state.installed) {
      await this.options.cli(['plugin', 'uninstall', PLUGIN_ID]);
    }
    if (state.marketplace) {
      await this.options.cli(['plugin', 'marketplace', 'remove', MARKETPLACE]);
    }
  }

  private async writeFiles(files: Readonly<Record<string, string>>): Promise<void> {
    for (const [path, text] of Object.entries(files)) {
      const target = join(this.root, path);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(`${target}.tmp`, text, { mode: 0o600 });
      await rename(`${target}.tmp`, target);
    }
  }

  private async backup(): Promise<void> {
    const folder = join(this.options.directory, 'setup-backups');
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const stamp = String(Date.now());
    for (const name of BACKED_UP) {
      await copyFile(
        join(this.options.pluginsDirectory, name),
        join(folder, `${stamp}-${name}`),
      ).catch((cause: unknown) => {
        if (!isMissing(cause)) {
          throw cause;
        }
      });
    }
  }
}
