import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createMcpToken,
  hashMcpToken,
  type ResponderApp,
  type ResponderAppStatus,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../store/store';
import { installPlugin, pluginState, removePlugin, type BridgeLaunch } from './claude-plugin';
import { codexHome, processEnvironment } from './environment';
import { isMissing } from './errors';
import { ProgramMissingError, codexProgram } from './executables';
import { ProgramError, runFile } from './run';

const APPS_FILE = z.record(z.string(), z.uuid());
const CODEX_LIST = z.array(
  z.looseObject({
    name: z.string(),
    transport: z.looseObject({ url: z.string().optional() }).optional(),
  }),
);
const SERVER = 'smarteverything';

const TOKEN_NAMES: Readonly<Record<ResponderApp, string>> = {
  'claude-code': 'Claude Code on this computer',
  codex: 'Codex on this computer',
};

export interface ConnectionsOptions {
  readonly store: Store;
  readonly dataDirectory: string;
  readonly localUrl: () => string;
  readonly bridge: () => BridgeLaunch;
}

async function codex(args: readonly string[]): Promise<string> {
  const program = await codexProgram();
  const result = await runFile(program.command, [...program.args, ...args], {
    cwd: tmpdir(),
    env: { ...processEnvironment(), CODEX_HOME: codexHome() },
  });
  return result.stdout;
}

function tableName(header: string): string {
  return header.replaceAll('"', '');
}

function codexUnavailable(cause: unknown): boolean {
  return (
    cause instanceof ProgramMissingError ||
    cause instanceof ProgramError ||
    cause instanceof SyntaxError ||
    cause instanceof z.ZodError
  );
}

async function codexList(): Promise<z.infer<typeof CODEX_LIST> | null> {
  try {
    return CODEX_LIST.parse(JSON.parse(await codex(['mcp', 'list', '--json'])));
  } catch (cause) {
    if (!codexUnavailable(cause)) {
      throw cause;
    }
    return null;
  }
}

export function withoutServer(toml: string, name: string): string {
  let skipping = false;
  return toml
    .split('\n')
    .filter((line) => {
      const header = /^\s*\[([^\]]+)\]\s*$/.exec(line)?.[1];
      if (header !== undefined) {
        const table = tableName(header);
        skipping = table === `mcp_servers.${name}` || table.startsWith(`mcp_servers.${name}.`);
      }
      return !skipping;
    })
    .join('\n')
    .trimEnd();
}

export function serverBlock(name: string, url: string, key: string): string {
  return `[mcp_servers.${name}]\nurl = ${JSON.stringify(url)}\nhttp_headers = { Authorization = ${JSON.stringify(`Bearer ${key}`)} }\ntool_timeout_sec = 120\n`;
}

export class ResponderConnections {
  private cache: readonly ResponderAppStatus[] = [];

  constructor(private readonly options: ConnectionsOptions) {}

  get statuses(): readonly ResponderAppStatus[] {
    return this.cache;
  }

  private get directory(): string {
    return join(this.options.dataDirectory, 'assistant');
  }

  async refresh(): Promise<readonly ResponderAppStatus[]> {
    const tokens = await this.tokenIds();
    this.cache = await Promise.all([this.claudeStatus(tokens), this.codexStatus(tokens)]);
    return this.cache;
  }

  async connect(app: ResponderApp): Promise<void> {
    const key = await this.newKey(app);
    if (app === 'claude-code') {
      await installPlugin(
        join(this.directory, 'claude-plugin'),
        this.options.bridge(),
        join(this.directory, 'setup-backups'),
      );
    } else {
      await this.connectCodex(key);
    }
    await this.refresh();
  }

  async disconnect(app: ResponderApp): Promise<void> {
    if (app === 'claude-code') {
      await removePlugin();
    } else {
      await this.writeCodex((toml) => `${withoutServer(toml, SERVER)}\n`);
    }
    await this.revoke(app);
    await this.refresh();
  }

  private async claudeStatus(
    tokens: Readonly<Record<string, string>>,
  ): Promise<ResponderAppStatus> {
    const plugin = await pluginState();
    const tokenId = tokens['claude-code'] ?? null;
    if (!plugin.cli) {
      return {
        app: 'claude-code',
        state: 'not_installed',
        detail: 'Install Claude Code, run claude once, then connect.',
        token_id: tokenId,
      };
    }
    if (!plugin.installed || !plugin.enabled || tokenId === null) {
      return {
        app: 'claude-code',
        state: plugin.installed ? 'needs_repair' : 'not_connected',
        detail: null,
        token_id: tokenId,
      };
    }
    return { app: 'claude-code', state: 'connected', detail: null, token_id: tokenId };
  }

  private async codexStatus(tokens: Readonly<Record<string, string>>): Promise<ResponderAppStatus> {
    const tokenId = tokens['codex'] ?? null;
    const listed = await codexList();
    if (listed === null) {
      return {
        app: 'codex',
        state: 'not_installed',
        detail: 'Install Codex, sign in, then connect.',
        token_id: tokenId,
      };
    }
    const url = listed.find((item) => item.name === SERVER)?.transport?.url;
    if (url === undefined) {
      return { app: 'codex', state: 'not_connected', detail: null, token_id: tokenId };
    }
    const current = url === `${this.options.localUrl()}/mcp` && tokenId !== null;
    return {
      app: 'codex',
      state: current ? 'connected' : 'needs_repair',
      detail: current ? null : 'It points at an old address. Connect again to fix it.',
      token_id: tokenId,
    };
  }

  private async connectCodex(key: string): Promise<void> {
    await codex(['--version']);
    const url = `${this.options.localUrl()}/mcp`;
    await this.writeCodex(
      (toml) => `${withoutServer(toml, SERVER)}\n\n${serverBlock(SERVER, url, key)}`,
    );
    const listed = CODEX_LIST.parse(JSON.parse(await codex(['mcp', 'list', '--json'])));
    if (listed.find((item) => item.name === SERVER)?.transport?.url !== url) {
      throw new Error(
        'Codex did not pick up the SmartEverything connection. Nothing else was changed.',
      );
    }
  }

  private async writeCodex(update: (toml: string) => string): Promise<void> {
    const home = codexHome();
    const path = join(home, 'config.toml');
    const original = await readFile(path, 'utf8').catch(() => '');
    const backups = join(this.directory, 'setup-backups');
    await mkdir(backups, { recursive: true, mode: 0o700 });
    await writeFile(join(backups, `${String(Date.now())}-codex-config.toml`), original, {
      mode: 0o600,
    });
    await mkdir(home, { recursive: true, mode: 0o700 });
    await writeFile(`${path}.smarteverything.tmp`, update(original), { mode: 0o600 });
    await rename(`${path}.smarteverything.tmp`, path);
  }

  private async newKey(app: ResponderApp): Promise<string> {
    await this.revoke(app);
    const token = createMcpToken();
    const row = this.options.store.assistant.createToken(
      TOKEN_NAMES[app],
      hashMcpToken(token),
      true,
    );
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.directory, `${app}.key`), `${token}\n`, { mode: 0o600 });
    await this.saveTokenIds({ ...(await this.tokenIds()), [app]: row.id });
    return token;
  }

  private async revoke(app: ResponderApp): Promise<void> {
    const tokens = await this.tokenIds();
    const id = tokens[app];
    if (id !== undefined) {
      this.options.store.assistant.revokeToken(id);
      const rest = Object.fromEntries(Object.entries(tokens).filter(([key]) => key !== app));
      await this.saveTokenIds(rest);
    }
    await rm(join(this.directory, `${app}.key`), { force: true });
  }

  private async tokenIds(): Promise<Readonly<Record<string, string>>> {
    try {
      return APPS_FILE.parse(JSON.parse(await readFile(join(this.directory, 'apps.json'), 'utf8')));
    } catch (cause) {
      if (!isMissing(cause)) {
        throw cause;
      }
      return {};
    }
  }

  private async saveTokenIds(tokens: Readonly<Record<string, string>>): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.directory, 'apps.json.tmp'), JSON.stringify(tokens), { mode: 0o600 });
    await rename(join(this.directory, 'apps.json.tmp'), join(this.directory, 'apps.json'));
  }
}
