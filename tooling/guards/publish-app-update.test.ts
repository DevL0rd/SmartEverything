import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  APP_UPDATE_ENTRY,
  RELEASE_NOTES_MAX_LENGTH,
  type AppUpdateEntry,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { expoManifestFor } from '../../apps/hub/src/app-updates/expo-manifest.ts';
import { readIndex } from '../../apps/hub/src/app-updates/store.ts';
import {
  PublishUsageError,
  execute,
  listLines,
  REPUBLISH_NOTE,
  withRepublishNote,
  parseArgs,
  type Arguments,
  type Defaults,
} from '../publish-app-update.ts';
import {
  configCommand,
  exportCommand,
  parseExpoClient,
  parseRuntime,
  publishAndroid,
  runtimeCommand,
} from '../publish-app-update-android.ts';
import { PublishOutputError } from '../publish-app-update-shared.ts';
import {
  useWorkspace,
  SERVER,
  ID,
  DEFAULTS,
  workspace,
  fixture,
  dependencies,
  args,
  CLI_TARGET,
  REMOTE,
  publisher,
} from './publish-app-update-fixture.ts';

useWorkspace();

function parse(argv: readonly string[], defaults: Defaults = DEFAULTS): Arguments {
  return parseArgs([...CLI_TARGET, ...argv], defaults);
}

describe('parseArgs', () => {
  it('reports an unknown flag and a missing value as usage errors', () => {
    expect(() => parse(['list', '--nope'], DEFAULTS)).toThrow(PublishUsageError);
    expect(() => parse(['publish', '--notes'], DEFAULTS)).toThrow(/publish-app-update/u);
  });

  it('reads publish with the defaults', () => {
    const parsed = parse(
      ['publish', '--platform', 'android', '--channel', 'dev', '--notes', ' words '],
      DEFAULTS,
    );
    expect(parsed).toMatchObject({
      command: 'publish',
      platform: 'android',
      channel: 'dev',
      notes: 'words',
      server: SERVER,
    });
    expect(parsed).toMatchObject(REMOTE);
  });

  it('takes the options given', () => {
    const parsed = parse(
      [
        'publish',
        '--platform',
        'android',
        '--channel',
        'release',
        '--notes',
        'n',
        '--hub',
        'https://other-hub.test',
        '--token-file',
        '/other.token',
        '--pin',
        'a'.repeat(64),
        '--server',
        'https://other.test',
      ],
      DEFAULTS,
    );
    expect(parsed).toMatchObject({ server: 'https://other.test', channel: 'release' });
    expect(parsed).toMatchObject({
      hub: 'https://other-hub.test',
      tokenFile: '/other.token',
      pin: 'a'.repeat(64),
    });
  });

  it('reads a launch file for an Android publish and refuses it for other commands', () => {
    const publish = ['publish', '--platform', 'android', '--channel', 'dev', '--notes', 'n'];
    expect(parse([...publish, '--launch-file', '/x/crash.js'], DEFAULTS)).toMatchObject({
      launchFile: '/x/crash.js',
    });
    expect(() => parse(['list', '--launch-file', '/x/crash.js'], DEFAULTS)).toThrow(
      PublishUsageError,
    );
  });

  it('reads list with a remote publisher and no build server', () => {
    const parsed = parse(['list'], { server: undefined });
    expect(parsed.command).toBe('list');
    expect(parsed).toMatchObject(REMOTE);
  });

  it('requires the remote hub and publisher token file', () => {
    expect(() => parseArgs(['list'], DEFAULTS)).toThrow(/hub/u);
    expect(() => parseArgs(['list', '--hub', SERVER], DEFAULTS)).toThrow(/tokenFile/u);
    expect(() => parseArgs(['list', '--data', '/d'], DEFAULTS)).toThrow(/Unknown option/u);
  });

  it('refuses a missing channel, missing notes, a non https server and no server', () => {
    const base = ['publish', '--platform', 'android'];
    expect(() => parse([...base, '--notes', 'n'], DEFAULTS)).toThrow(PublishUsageError);
    expect(() => parse([...base, '--channel', 'dev'], DEFAULTS)).toThrow(/notes/u);
    expect(() =>
      parse([...base, '--channel', 'dev', '--notes', 'n', '--server', 'http://x.test'], DEFAULTS),
    ).toThrow(/server/u);
    expect(() =>
      parse([...base, '--channel', 'dev', '--notes', 'n'], { server: undefined }),
    ).toThrow(/server/u);
  });

  it('refuses a platform and a command that are not available, and shows the usage', () => {
    expect(() =>
      parse(['publish', '--platform', 'ios', '--channel', 'dev', '--notes', 'n'], DEFAULTS),
    ).toThrow(/publish-app-update <command>/u);
    expect(() => parse(['promote'], DEFAULTS)).toThrow(PublishUsageError);
    expect(() => parse([], DEFAULTS)).toThrow(PublishUsageError);
    expect(() => parse(['list', 'extra'], DEFAULTS)).toThrow(/Unexpected extra/u);
    expect(() => parse(['list', '--channel', 'dev'], DEFAULTS)).toThrow(PublishUsageError);
  });

  it('requires nonblank release notes within the authoring limit', () => {
    const publish = ['publish', '--platform', 'android', '--channel', 'dev', '--notes'];
    expect(() => parse([...publish, ' \n\t '], DEFAULTS)).toThrow(/notes:/u);
    expect(() => parse([...publish, 'n'.repeat(RELEASE_NOTES_MAX_LENGTH + 1)], DEFAULTS)).toThrow(
      /notes:/u,
    );
  });
});

describe('commands', () => {
  it('runs the export, the runtime and the config in the release environment of release-android', () => {
    const commands = [exportCommand(SERVER, '/out'), runtimeCommand(SERVER), configCommand(SERVER)];
    for (const command of commands) {
      expect(command.environment).toMatchObject({
        ANDROID_VARIANT: 'release',
        NODE_ENV: 'production',
        EXPO_PUBLIC_SERVER_URL: SERVER,
      });
      expect(command.cwd.endsWith(join('apps', 'app'))).toBe(true);
    }
    expect(commands[0]?.args).toEqual([
      'expo',
      'export',
      '--platform',
      'android',
      '--output-dir',
      '/out',
      '--clear',
    ]);
    expect(commands[1]?.args).toEqual([
      'expo-updates',
      'runtimeversion:resolve',
      '--platform',
      'android',
    ]);
    expect(commands[2]?.args).toEqual(['expo', 'config', '--type', 'public', '--json']);
  });
});

describe('output parsing', () => {
  it('reads the runtime version', () => {
    expect(parseRuntime('{"runtimeVersion":"abc","fingerprintSources":[1]}')).toBe('abc');
  });

  it('names the source of an output it cannot use', () => {
    expect(() => parseRuntime('not json')).toThrow(PublishOutputError);
    expect(() => parseRuntime('{"runtimeVersion":""}')).toThrow(/expo-updates/u);
    expect(() => parseExpoClient('[]')).toThrow(/expo config/u);
  });

  it('reads the public config as JSON values', () => {
    expect(parseExpoClient('{"name":"A","extra":{"x":[1,null]}}')).toEqual({
      name: 'A',
      extra: { x: [1, null] },
    });
  });
});

describe('execute', () => {
  it('lists every entry with its state', async () => {
    fixture([{ path: 'assets/one', ext: 'png' }]);
    const entry = await publishAndroid(args(), dependencies());
    expect(APP_UPDATE_ENTRY.parse(entry)).toEqual(entry);
    const lines = await execute({ command: 'list', ...REMOTE }, publisher(), dependencies());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(entry.id);
    expect(lines[0]).toContain('live');
    expect(lines[0]).toContain('simulation');
  });

  it('shows withdrawn entries with their reason', () => {
    const lines = listLines([
      {
        id: ID,
        platform: 'android',
        channel: 'release',
        runtimeVersion: 'r',
        createdAt: '2026-10-25T10:00:00.000Z',
        appVersion: '0.1.0',
        notes: 'n',
        size: 0,
        withdrawn: { at: '2026-10-25T10:05:00.000Z', reason: 'bad boot' },
      },
    ]);
    expect(lines[0]).toContain('withdrawn: bad boot');
  });

  it('adds the republish cost note only when an entry was republished', () => {
    const base = {
      id: ID,
      platform: 'android',
      channel: 'release',
      runtimeVersion: 'r',
      createdAt: '2026-10-25T10:00:00.000Z',
      appVersion: '0.1.0',
      notes: 'n',
      launch: null,
      files: [],
      expoClient: null,
    } satisfies Omit<AppUpdateEntry, 'withdrawn'>;
    const gone = { ...base, withdrawn: { at: '2026-10-25T10:05:00.000Z', reason: 'bad' } };
    expect(withRepublishNote([gone])).toHaveLength(1);
    const lines = withRepublishNote([gone, { ...base, withdrawn: null }]);
    expect(lines).toHaveLength(3);
    expect(lines.at(-1)).toBe(REPUBLISH_NOTE);
  });

  it('preserves the full release notes from the CLI through the Android manifest', async () => {
    fixture([]);
    const notes =
      'Camera previews reconnect automatically.\n\n- Previews resume after a brief outage.';
    const publish = [
      'publish',
      '--platform',
      'android',
      '--channel',
      'dev',
      '--notes',
      `  ${notes}\n`,
    ];
    const lines = await execute(parse(publish, DEFAULTS), publisher(), dependencies());
    const published = APP_UPDATE_ENTRY.parse(JSON.parse(lines[0] ?? ''));
    expect(published).toMatchObject({ runtimeVersion: 'rt-1', notes });
    const [entry] = (await readIndex(workspace.data)).entries;
    assert.ok(entry);
    expect(entry).toEqual(published);
    const manifest = expoManifestFor(entry, SERVER, (hash) => `/assets/${hash}`);
    expect(manifest.extra.smarteverything.notes).toBe(notes);
  });
});
