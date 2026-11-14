import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pnpmProgram } from '../build-host.ts';
import { useBuildHost } from './build-host-fixture.ts';
import { gitSourceText } from '../hub-update-source.ts';
import { hubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import { schemaVersionOf } from '../release-hub-files.ts';
import { candidateIdentity } from '../self-update-candidate-identity.ts';
import type { StepOutcome, StepRequest } from '../self-update-commands.ts';
import { approvedRemoteHubBuild, localHubBuild } from '../self-update-hub-build.ts';

const DATABASE_RELATIVE = relative('/root', hubLayout('/root', {}).system.database.file);

const MIGRATIONS = `
import { dirname, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const [command, flag, data] = process.argv.slice(2);
if (command !== 'check' || flag !== '--data') process.exit(3);
const db = new DatabaseSync(join(data, ${JSON.stringify(DATABASE_RELATIVE)}));
const { version: from } = db.prepare('select max(version) as version from schema_version').get();
db.exec('insert into schema_version values (7)');
const { version: to } = db.prepare('select max(version) as version from schema_version').get();
db.close();
process.stdout.write(JSON.stringify({ from, to }) + '\\n');
`;

useBuildHost();

let scratch: string;
let candidate: string;
let source: string;
let tip: string;

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

function checkMigrationStep(request: StepRequest): StepOutcome {
  const step = request.steps[0];
  if (step === undefined) throw new Error('No migration command was requested.');
  const outcome = spawnSync(process.execPath, step.args.slice(2), {
    cwd: step.cwd,
    encoding: 'utf8',
  });
  return { status: outcome.status ?? 1, output: outcome.stdout + outcome.stderr };
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
  it('executes the candidate migration command against a disposable database copy', async () => {
    const layout = await testLayout(join(scratch, 'database'));
    mkdirSync(dirname(layout.system.database.file), { recursive: true });
    const database = new DatabaseSync(layout.system.database.file);
    database.exec(
      'create table schema_version (version integer); insert into schema_version values (4)',
    );
    database.close();
    const migrationScratch = join(scratch, 'migrations');
    let copiedData: string | undefined;
    const build = approvedRemoteHubBuild(await approved(), migrationScratch, (request) => {
      const step = request.steps[0];
      expect(step?.cwd).toBe(candidate);
      copiedData = step?.args.at(-1);
      expect(copiedData).toMatch(/candidate-migrations-/u);
      expect(copiedData).not.toBe(layout.root);
      return checkMigrationStep(request);
    });

    await expect(build.checkMigrations(layout)).resolves.toEqual({ from: 4, to: 7 });
    expect(schemaVersionOf(layout.system.database.file)).toBe(4);
    expect(copiedData === undefined ? true : existsSync(copiedData)).toBe(false);
  });

  it('refuses changed source bytes before executing the approved checkout', async () => {
    const build = approvedRemoteHubBuild(await approved(), scratch, () => {
      throw new Error('A stale approval must not run any command.');
    });
    writeFileSync(join(candidate, 'tooling', 'release-hub.ts'), 'changed');
    await expect(build.typeErrors()).rejects.toMatchObject({ code: 'changed' });
  });

  it('refuses an escaping symlink before dependencies can install', async () => {
    const build = approvedRemoteHubBuild(await approved(), scratch, () => {
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
    const build = approvedRemoteHubBuild(await approved(), scratch, (request) => {
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
    const build = approvedRemoteHubBuild(await approved(), scratch, (request) => {
      expect(request.steps[0]?.args.at(-1)).toBe(stage);
      mkdirSync(stage);
      return { status: 0, output: '' };
    });

    await expect(build.build(stage)).resolves.toBeUndefined();
  });

  it('rejects a build step that modifies an approved file', async () => {
    const stage = join(scratch, 'stage');
    const build = approvedRemoteHubBuild(await approved(), scratch, (request) => {
      expect(request.steps[0]?.cwd).toBe(candidate);
      expect(request.steps[0]?.args.at(-1)).toBe(stage);
      writeFileSync(join(candidate, 'tooling', 'release-hub.ts'), 'changed by the build');
      return { status: 0, output: '' };
    });

    await expect(build.build(stage)).rejects.toMatchObject({ code: 'changed' });
  });

  it('does not run a candidate build whose output could overwrite either checkout', async () => {
    const build = approvedRemoteHubBuild(await approved(), scratch, () => {
      throw new Error('An overlapping output must not run any command.');
    });

    await expect(build.build(join(source, 'stage'))).rejects.toMatchObject({ code: 'git' });
    await expect(build.build(join(candidate, 'stage'))).rejects.toMatchObject({ code: 'git' });
    await expect(build.build(scratch)).rejects.toMatchObject({ code: 'git' });
  });
});

describe('preparing the local checkout', () => {
  it('preserves stable tracked and untracked changes across type checking and building', async () => {
    const requests: StepRequest[] = [];
    const pending = join(candidate, 'pending.ts');
    const tracked = join(candidate, 'tooling', 'release-hub.ts');
    writeFileSync(pending, 'export const pending = true;');
    writeFileSync(tracked, `${MIGRATIONS}\n`);
    const build = localHubBuild(candidate, (request) => {
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
    const build = localHubBuild(candidate, () => ({ status: 1, output: 'spawn tsc ENOENT' }));
    await expect(build.typeErrors()).rejects.toThrow('spawn tsc ENOENT');
  });

  it('runs the service build through the running node with tsx', async () => {
    const requests: StepRequest[] = [];
    const build = localHubBuild(candidate, (request) => {
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
    const build = localHubBuild(candidate, (request) => {
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
    const build = localHubBuild(candidate, () => {
      writeFileSync(file, MIGRATIONS);
      utimesSync(file, 0, 0);
      return { status: 0, output: '' };
    });
    await expect(build.build(join(scratch, 'service'))).rejects.toMatchObject({ code: 'changed' });
  });
});
