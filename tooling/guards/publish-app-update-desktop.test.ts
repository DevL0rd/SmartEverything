import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { blobFile, readIndex } from '../../apps/hub/src/app-updates/store.ts';
import {
  PublishUsageError,
  execute,
  parseArgs,
  type Arguments,
  type Defaults,
} from '../publish-app-update.ts';
import { exportedPaths, publishDesktop, webExportCommand } from '../publish-app-update-desktop.ts';
import {
  AssetTypeError,
  PublishCommandError,
  PublishOutputError,
  type CommandRunner,
  type Dependencies,
} from '../publish-app-update-shared.ts';
import type { Command } from '../release-android.ts';
import { readReleaseVersion } from '../release-version.ts';
import {
  useWorkspace,
  workspace,
  publisher,
  updateHub,
  REMOTE,
  CLI_TARGET,
  DEFAULTS,
  SERVER,
  ID,
} from './publish-app-update-fixture.ts';

useWorkspace();

function parse(argv: readonly string[], defaults: Defaults = DEFAULTS): Arguments {
  return parseArgs([...CLI_TARGET, ...argv], defaults);
}

let data: HubLayout;
let web = '';
let commands: Command[] = [];

beforeEach(() => {
  data = workspace.data;
  web = join(workspace.base, 'web');
  mkdirSync(web);
  commands = [];
});

function put(path: string, text: string): void {
  const file = join(web, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function fixture(): void {
  put('index.html', '<html></html>');
  put('_expo/static/js/web/entry-1.js', 'console.log(1)');
  put('assets/fonts/a.ttf', 'font');
  put('assets/wasm/engine.wasm', 'wasm');
  put('metadata.json', '{}');
}

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function runner(): CommandRunner {
  return (command) => {
    commands.push(command);
    return '';
  };
}

function dependencies(run: CommandRunner = runner()): Dependencies {
  return {
    run,
    exportDirectory: '/unused',
    webDirectory: web,
    desktopRuntime: () => Promise.resolve('desktop-runtime-1'),
  };
}

const REQUEST = { server: SERVER, channel: 'dev', notes: 'desktop words' } as const;

describe('webExportCommand', () => {
  it('runs the app web export in the release environment', () => {
    const command = webExportCommand(SERVER);
    expect(command.program).toBe('pnpm');
    expect(command.args).toEqual(['--filter', '@smarteverything/app', 'run', 'export:web']);
    expect(command.environment).toMatchObject({
      NODE_ENV: 'production',
      EXPO_PUBLIC_SERVER_URL: SERVER,
    });
  });
});

describe('exportedPaths', () => {
  it('lists every file with relative posix paths in a stable order', async () => {
    fixture();
    expect(await exportedPaths(web)).toEqual([
      '_expo/static/js/web/entry-1.js',
      'assets/fonts/a.ttf',
      'assets/wasm/engine.wasm',
      'index.html',
      'metadata.json',
    ]);
  });
});

describe('publishDesktop', () => {
  it('exports, writes every file as a blob and appends a desktop entry', async () => {
    fixture();
    const entry = await publishDesktop({ ...REQUEST, target: publisher() }, dependencies());
    expect(commands.map((command) => command.args.at(-1))).toEqual(['export:web']);
    expect(entry).toMatchObject({
      platform: 'desktop',
      channel: 'dev',
      runtimeVersion: 'desktop-runtime-1',
      appVersion: readReleaseVersion('desktop'),
      createdAt: '2026-10-25T11:12:13.000Z',
      notes: 'desktop words',
      launch: null,
      expoClient: null,
      withdrawn: null,
    });
    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(entry.files.map((file) => [file.path, file.contentType])).toEqual([
      ['_expo/static/js/web/entry-1.js', 'application/javascript'],
      ['assets/fonts/a.ttf', 'font/ttf'],
      ['assets/wasm/engine.wasm', 'application/wasm'],
      ['index.html', 'text/html'],
      ['metadata.json', 'application/json'],
    ]);
    expect(entry.files[0]).toMatchObject({ sha256: sha('console.log(1)'), size: 14 });
    expect(readFileSync(blobFile(data, sha('wasm')), 'utf8')).toBe('wasm');
    expect((await readIndex(data)).entries).toEqual([entry]);
  });

  it('writes nothing when the export fails', async () => {
    fixture();
    const failing: CommandRunner = (command) => {
      throw new PublishCommandError(command.title, 2);
    };
    await expect(
      publishDesktop({ ...REQUEST, target: publisher() }, dependencies(failing)),
    ).rejects.toThrow(PublishCommandError);
    expect(existsSync(data.system.updates.appUpdates)).toBe(false);
  });

  it('does not publish an export without an entry page', async () => {
    put('_expo/static/js/web/entry.js', 'console.log(1)');
    await expect(
      publishDesktop({ ...REQUEST, target: publisher() }, dependencies()),
    ).rejects.toThrow(PublishOutputError);
    expect(existsSync(data.system.updates.appUpdates)).toBe(false);
  });

  it('names a file with no content type and writes no index', async () => {
    fixture();
    put('assets/odd.xyz', 'odd');
    await expect(
      publishDesktop({ ...REQUEST, target: publisher() }, dependencies()),
    ).rejects.toThrow(AssetTypeError);
    expect(existsSync(join(data.system.updates.appUpdates, 'index.json'))).toBe(false);
  });
});

describe('parseArgs for the other commands', () => {
  it('reads publish for desktop and all', () => {
    for (const platform of ['desktop', 'all']) {
      expect(
        parse(['publish', '--platform', platform, '--channel', 'dev', '--notes', 'n'], DEFAULTS),
      ).toMatchObject({ command: 'publish', platform });
    }
  });

  it('reads promote, withdraw, rollback and prune', () => {
    const endpoint = ['--hub', 'https://remote.test', '--token-file', '/remote.token'];
    const expected = { hub: 'https://remote.test', tokenFile: '/remote.token' };
    const promote = parse(['promote', '--id', ID, '--channel', 'release', ...endpoint]);
    expect(promote).toMatchObject({ command: 'promote', id: ID, channel: 'release', ...expected });
    const withdraw = parse(['withdraw', '--id', ID, '--reason', ' bad ', ...endpoint]);
    expect(withdraw).toMatchObject({ command: 'withdraw', id: ID, reason: 'bad', ...expected });
    const rollback = ['rollback', '--platform', 'desktop', '--channel', 'dev', '--reason', 'r'];
    expect(parse([...rollback, ...endpoint])).toMatchObject({
      command: 'rollback',
      toEmbedded: false,
      ...expected,
    });
    expect(parse([...rollback, '--to-embedded', ...endpoint])).toMatchObject({
      toEmbedded: true,
      ...expected,
    });
    expect(parse(['prune', ...endpoint])).toMatchObject({ command: 'prune', ...expected });
    expect(parse(['prune'])).toMatchObject(REMOTE);
  });

  it('requires a reason for withdraw and rollback and an id that is a uuid', () => {
    expect(() => parse(['withdraw', '--id', ID], DEFAULTS)).toThrow(/reason/u);
    expect(() =>
      parse(['rollback', '--platform', 'android', '--channel', 'dev'], DEFAULTS),
    ).toThrow(/reason/u);
    expect(() => parse(['promote', '--id', 'x', '--channel', 'dev'], DEFAULTS)).toThrow(
      PublishUsageError,
    );
    expect(() => parse(['list', '--to-embedded'], DEFAULTS)).toThrow(PublishUsageError);
  });
});

describe('execute', () => {
  it('promotes, withdraws and rolls back through the index and prints the entries', async () => {
    fixture();
    const original = await publishDesktop({ ...REQUEST, target: publisher() }, dependencies());
    updateHub().setNow(new Date('2026-10-25T11:12:14.000Z'));
    const promoted = await execute(
      { command: 'promote', id: original.id, channel: 'release', ...REMOTE },
      publisher(),
      dependencies(),
    );
    const promotedEntry = (await readIndex(data)).entries.find(
      (entry) => entry.channel === 'release',
    );
    assert.ok(promotedEntry);
    expect(promotedEntry.id).not.toBe(original.id);
    expect(promoted[0]).toContain(promotedEntry.id);
    expect(promoted[0]).toContain('release');
    updateHub().setNow(new Date('2026-10-25T11:12:15.000Z'));
    const withdrawn = await execute(
      { command: 'withdraw', id: promotedEntry.id, reason: 'bad', ...REMOTE },
      publisher(),
      dependencies(),
    );
    expect(withdrawn[0]).toContain('withdrawn: bad');
    updateHub().setNow(new Date('2026-10-25T11:12:16.000Z'));
    const rolled = await execute(
      {
        command: 'rollback',
        platform: 'desktop',
        channel: 'dev',
        reason: 'r',
        toEmbedded: true,
        ...REMOTE,
      },
      publisher(),
      dependencies(),
    );
    expect(rolled).toHaveLength(1);
    expect((await readIndex(data)).entries.map((entry) => entry.withdrawn !== null)).toEqual([
      true,
      true,
    ]);
  });

  it('prunes blobs no entry references and prints them', async () => {
    fixture();
    await publishDesktop({ ...REQUEST, target: publisher() }, dependencies());
    writeFileSync(blobFile(data, 'a'.repeat(64)), 'orphan');
    const lines = await execute({ command: 'prune', ...REMOTE }, publisher(), dependencies());
    expect(lines).toEqual([`removed ${'a'.repeat(64)}`]);
    expect(await execute({ command: 'prune', ...REMOTE }, publisher(), dependencies())).toEqual([
      'no unused blobs',
    ]);
  });

  it('publishes android then desktop for all', async () => {
    const order: string[] = [];
    const run: CommandRunner = (command) => {
      order.push(command.args.join(' '));
      throw new PublishCommandError(command.title, 1);
    };
    await expect(
      execute(
        {
          command: 'publish',
          platform: 'all',
          channel: 'dev',
          notes: 'n',
          ...REMOTE,
          server: SERVER,
        },
        publisher(),
        dependencies(run),
      ),
    ).rejects.toThrow(PublishCommandError);
    expect(order).toHaveLength(1);
    expect(order[0]).toContain('generate-licenses.ts');
  });
});
