import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pnpmProgram } from '../build-host.ts';
import { useBuildHost } from './build-host-fixture.ts';
import { gitSourceText } from '../hub-update-source.ts';
import type { HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import { schemaVersionOf } from '../release-hub-files.ts';
import { candidateIdentity } from '../self-update-candidate-identity.ts';
import type { StepOutcome, StepRequest } from '../self-update-commands.ts';
import { HubBuildSourceError } from '../hub-build-gate.ts';
import { approvedRemoteHubBuild, localHubBuild } from '../self-update-hub-build.ts';

const MIGRATIONS = 'export const migrations = true;';

const MIGRATION_ENTRY = `
import { DatabaseSync } from 'node:sqlite';
const [database] = process.argv.slice(2);
const db = new DatabaseSync(database, { readOnly: true });
const { version: from } = db.prepare('select max(version) as version from schema_version').get();
db.close();
process.stdout.write(JSON.stringify({ from, to: 7 }) + '\\n');
`;

function remoteBuild(
  layout: HubLayout,
  input: unknown,
  run: (request: StepRequest) => StepOutcome,
): ReturnType<typeof approvedRemoteHubBuild> {
  return approvedRemoteHubBuild(layout, input, run, process.execPath);
}

function localBuild(
  layout: HubLayout,
  root: string,
  run: (request: StepRequest) => StepOutcome,
): ReturnType<typeof localHubBuild> {
  return localHubBuild(layout, root, run, process.execPath);
}

useBuildHost();

let scratch: string;
let candidate: string;
let source: string;
let tip: string;

async function layoutWithSource(source: string): Promise<HubLayout> {
  const layout = await testLayout(join(scratch, `database-${source}`));
  mkdirSync(dirname(layout.system.database.file), { recursive: true });
  const database = new DatabaseSync(layout.system.database.file);
  database.exec(
    'create table ai_settings (key text primary key, settings text not null, updated_at text not null)',
  );
  database
    .prepare('insert into ai_settings values (?, ?, ?)')
    .run('updates.buildSource.hub', JSON.stringify({ source }), '2026-11-14T00:00:00.000Z');
  database.close();
  return layout;
}

function git(root: string, ...args: string[]): Promise<string> {
  return gitSourceText(root, args, 'prepare a release fixture');
}

async function approved(): Promise<Record<string, string>> {
  return {
    source,
    root: candidate,
    tip,
    identity: await candidateIdentity(candidate),
  };
}

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'hub-approved-build-'));
  source = join(scratch, 'source');
  candidate = join(scratch, 'candidate');
  await git(scratch, 'init', '-b', 'main', candidate);
  mkdirSync(source);
  mkdirSync(join(candidate, 'tooling'));
  writeFileSync(join(candidate, 'tooling', 'release-hub.ts'), MIGRATIONS);
  await git(candidate, 'add', '-A');
  await git(
    candidate,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'approved candidate',
  );
  tip = (await git(candidate, 'rev-parse', 'HEAD')).trim();
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('preparing the exact approved remote checkout', () => {
  it('runs the built service migration check against the live database without changing it', async () => {
    const layout = await testLayout(join(scratch, 'database'));
    mkdirSync(dirname(layout.system.database.file), { recursive: true });
    const database = new DatabaseSync(layout.system.database.file);
    database.exec(
      'create table schema_version (version integer); insert into schema_version values (4)',
    );
    database.close();
    const stage = join(scratch, 'stage');
    const build = remoteBuild(await layoutWithSource('hub'), await approved(), () => {
      mkdirSync(join(stage, 'update'), { recursive: true });
      writeFileSync(join(stage, 'update', 'migration-check.mjs'), MIGRATION_ENTRY);
      return { status: 0, output: '' };
    });

    await expect(build.checkMigrations(layout)).rejects.toThrow('Build the service');
    await build.build(stage);
    await expect(build.checkMigrations(layout)).resolves.toEqual({ from: 4, to: 7 });
    expect(schemaVersionOf(layout.system.database.file)).toBe(4);
  });

  it('refuses changed source bytes before executing the approved checkout', async () => {
    const build = remoteBuild(await layoutWithSource('hub'), await approved(), () => {
      throw new Error('A stale approval must not run any command.');
    });
    writeFileSync(join(candidate, 'tooling', 'release-hub.ts'), 'changed');
    await expect(build.typeErrors()).rejects.toMatchObject({ code: 'changed' });
  });

  it('refuses an escaping symlink before dependencies can install', async () => {
    const build = remoteBuild(await layoutWithSource('hub'), await approved(), () => {
      throw new Error('An escaping link must not run any command.');
    });
    symlinkSync(source, join(candidate, 'escape'));
    await expect(build.typeErrors()).rejects.toMatchObject({ code: 'git' });
  });

  it('prepares a candidate that changes a shared client-facing API file', async () => {
    const api = join(candidate, 'packages', 'domain', 'src', 'api');
    mkdirSync(api, { recursive: true });
    writeFileSync(join(api, 'endpoints-ai.ts'), '/api/ai/memory/new-path');
    const requests: StepRequest[] = [];
    const build = remoteBuild(await layoutWithSource('hub'), await approved(), (request) => {
      requests.push(request);
      return { status: 0, output: '' };
    });

    await expect(build.typeErrors()).resolves.toBe(0);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.steps[0]?.program).toBe(pnpmProgram());
    expect(requests[0]?.steps[0]?.args).toEqual([
      'install',
      '--frozen-lockfile',
      '--prefer-offline',
    ]);
    expect(requests[1]?.steps[0]?.program).toBe(process.execPath);
    expect(requests[1]?.steps[0]?.args.slice(1)).toEqual(['-b', 'apps/hub']);
  });

  it('builds a candidate into a stage that carries no compatibility stamp', async () => {
    const stage = join(scratch, 'stage');
    const build = remoteBuild(await layoutWithSource('hub'), await approved(), (request) => {
      expect(request.steps[0]?.args.at(-1)).toBe(stage);
      mkdirSync(stage);
      return { status: 0, output: '' };
    });

    await expect(build.build(stage)).resolves.toBeUndefined();
  });

  it('rejects a build step that modifies an approved file', async () => {
    const stage = join(scratch, 'stage');
    const build = remoteBuild(await layoutWithSource('hub'), await approved(), (request) => {
      expect(request.steps[0]?.cwd).toBe(candidate);
      expect(request.steps[0]?.args.at(-1)).toBe(stage);
      writeFileSync(join(candidate, 'tooling', 'release-hub.ts'), 'changed by the build');
      return { status: 0, output: '' };
    });

    await expect(build.build(stage)).rejects.toMatchObject({ code: 'changed' });
  });

  it('does not run a candidate build whose output could overwrite either checkout', async () => {
    const build = remoteBuild(await layoutWithSource('hub'), await approved(), () => {
      throw new Error('An overlapping output must not run any command.');
    });

    await expect(build.build(join(source, 'stage'))).rejects.toMatchObject({ code: 'git' });
    await expect(build.build(join(candidate, 'stage'))).rejects.toMatchObject({ code: 'git' });
    await expect(build.build(scratch)).rejects.toMatchObject({ code: 'git' });
  });
});

describe('the hub build source gate', () => {
  it.each(['provided', 'github'])('refuses both builders when the source is %s', async (source) => {
    const layout = await layoutWithSource(source);
    expect(() => localBuild(layout, candidate, () => ({ status: 0, output: '' }))).toThrow(
      HubBuildSourceError,
    );
    const input = await approved();
    expect(() => remoteBuild(layout, input, () => ({ status: 0, output: '' }))).toThrow(
      /build source is .*, not hub\..*provision-build-host/u,
    );
  });
});

describe('preparing the local checkout', () => {
  it('preserves stable tracked and untracked changes across type checking and building', async () => {
    const requests: StepRequest[] = [];
    const pending = join(candidate, 'pending.ts');
    const tracked = join(candidate, 'tooling', 'release-hub.ts');
    writeFileSync(pending, 'export const pending = true;');
    writeFileSync(tracked, `${MIGRATIONS}\n`);
    const build = localBuild(await layoutWithSource('hub'), candidate, (request) => {
      requests.push(request);
      return { status: 0, output: '' };
    });
    const output = join(scratch, 'service');
    await expect(build.typeErrors()).resolves.toBe(0);
    await build.build(output);
    expect(requests.map(({ steps }) => steps[0]?.cwd)).toEqual([candidate, candidate]);
    expect(requests[0]?.steps[0]?.program).toBe(process.execPath);
    expect(requests[0]?.steps[0]?.args).toEqual([
      join(candidate, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p',
      'apps/hub',
      '--noEmit',
    ]);
    expect(requests[1]?.steps[0]?.args.at(-1)).toBe(output);
    expect(readFileSync(pending, 'utf8')).toBe('export const pending = true;');
    expect(readFileSync(tracked, 'utf8')).toBe(`${MIGRATIONS}\n`);
  });

  it('reports the output of a type check that failed without counting an error', async () => {
    const build = localBuild(await layoutWithSource('hub'), candidate, () => ({
      status: 1,
      output: 'spawn tsc ENOENT',
    }));
    await expect(build.typeErrors()).rejects.toThrow('spawn tsc ENOENT');
  });

  it('runs the service build through the running node with tsx', async () => {
    const requests: StepRequest[] = [];
    const build = localBuild(await layoutWithSource('hub'), candidate, (request) => {
      requests.push(request);
      return { status: 0, output: '' };
    });
    await build.build(join(scratch, 'service'));
    expect(requests[0]?.steps[0]?.program).toBe(process.execPath);
    expect(requests[0]?.steps[0]?.args.slice(0, 3)).toEqual([
      '--import',
      'tsx',
      'tooling/build-service.ts',
    ]);
  });

  it('refuses to build after an untracked file changed since the type check', async () => {
    const requests: StepRequest[] = [];
    const pending = join(candidate, 'pending.ts');
    writeFileSync(pending, 'export const pending = true;');
    const build = localBuild(await layoutWithSource('hub'), candidate, (request) => {
      requests.push(request);
      return { status: 0, output: '' };
    });
    await expect(build.typeErrors()).resolves.toBe(0);
    writeFileSync(pending, 'export const pending = false;');
    await expect(build.build(join(scratch, 'service'))).rejects.toMatchObject({ code: 'changed' });
    expect(requests).toHaveLength(1);
  });

  it('rejects a build that rewrites tracked source while running', async () => {
    const file = join(candidate, 'tooling', 'release-hub.ts');
    const build = localBuild(await layoutWithSource('hub'), candidate, () => {
      writeFileSync(file, MIGRATIONS);
      utimesSync(file, 0, 0);
      return { status: 0, output: '' };
    });
    await expect(build.build(join(scratch, 'service'))).rejects.toMatchObject({ code: 'changed' });
  });
});
