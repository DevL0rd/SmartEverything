import { randomUUID, sign } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { trustReleaseKey } from '../../apps/hub/src/releases/trust.ts';
import {
  releaseSigner,
  sha256,
  type ReleaseSigner,
} from '../../apps/hub/test/releases/release-fixture.ts';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import { hubInstall } from '../release-hub-files.ts';
import { readLedger, selfUpdatePaths } from '../self-update-files.ts';
import { hostServiceTarget, stagedHubBuild, type HubStage } from '../self-update-hub-stage.ts';
import { selfUpdateHub } from '../self-update-hub.ts';
import { startJob } from '../self-update-job.ts';
import type { ServiceTargetName } from '../service-target.ts';

const COMMIT = 'c'.repeat(40);
const STARTING_SCHEMA = 3;
const NEW_SCHEMA = 5;
const HOST = hostServiceTarget();
const OTHER: ServiceTargetName = HOST === 'linux-x64' ? 'linux-arm64' : 'linux-x64';

const MIGRATES = `
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const { version } = db.prepare('select max(version) as version from schema_version').get();
db.close();
process.stdout.write(JSON.stringify({ from: version, to: ${String(NEW_SCHEMA)} }) + '\\n');
`;

const NOT_IDEMPOTENT = `
process.stderr.write('a second open moved the schema from 5 to 6, so the migrations are not idempotent\\n');
process.exit(1);
`;

interface StageOptions {
  readonly target?: ServiceTargetName;
  readonly nodeVersion?: string;
  readonly migration?: string;
}

let scratch: string;
let signer: ReleaseSigner;
let layout: HubLayout;
let keysFile: string;

function serviceFiles(migration: string): Record<string, string> {
  return {
    'service.mjs': 'export {};\n',
    'voice-worker.mjs': 'export {};\n',
    'service-main.mjs': 'export {};\n',
    'loop-watchdog.mjs': 'export {};\n',
    'hook-helper.mjs': 'export {};\n',
    'raster-worker.mjs': 'export {};\n',
    'log-worker.mjs': 'export {};\n',
    'go2rtc/go2rtc': '#!/bin/sh\nexit 0\n',
    'update/hub-command.mjs': 'export {};\n',
    'update/watchdog.mjs': 'export {};\n',
    'update/step.mjs': 'export {};\n',
    'update/migration-check.mjs': migration,
  };
}

function writeStage(name: string, options: StageOptions = {}): string {
  const root = join(scratch, 'staged', name, 'release');
  const files = serviceFiles(options.migration ?? MIGRATES);
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, 'files', ...path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, { mode: path === 'go2rtc/go2rtc' ? 0o700 : 0o600 });
  }
  const manifest = Buffer.from(
    JSON.stringify({
      artifact: 'hub',
      target: options.target ?? HOST,
      facts: {
        schemaMin: 1,
        schemaMax: NEW_SCHEMA,
        nodeVersion: options.nodeVersion ?? process.versions.node,
      },
      version: '1.2.3',
      commit: COMMIT,
      notes: 'Faster camera previews.',
      files: Object.entries(files).map(([path, content]) => ({
        path,
        size: Buffer.byteLength(content),
        sha256: sha256(content),
        executable: path === 'go2rtc/go2rtc',
      })),
      gate: { typeCheck: 'passed', commit: COMMIT },
    }),
  );
  writeFileSync(join(root, 'release.json'), manifest);
  writeFileSync(
    join(root, 'release.sig'),
    JSON.stringify({
      algorithm: 'ed25519',
      fingerprint: signer.fingerprint,
      signature: sign(null, manifest, signer.privateKey).toString('base64'),
    }),
  );
  return root;
}

function stageOf(release: string): HubStage {
  return {
    release,
    keysFile,
    role: 'machine',
    node: process.execPath,
    host: HOST,
    verifyTarget: () => undefined,
  };
}

function writeDatabase(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec('create table schema_version (version integer not null)');
  database.prepare('insert into schema_version values (?)').run(STARTING_SCHEMA);
  database.close();
}

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'hub-stage-'));
  signer = releaseSigner();
  layout = await testLayout(join(scratch, 'data'));
  keysFile = layout.system.keys.releaseKeys;
  await trustReleaseKey(
    keysFile,
    { publicKey: signer.publicKey, role: 'machine', label: 'dev machine' },
    new Date('2026-11-14T00:00:00Z'),
  );
  writeDatabase(layout.system.database.file);
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('stagedHubBuild', () => {
  it('copies the verified tree, marks its executables and checks the migrations', async () => {
    const build = stagedHubBuild(stageOf(writeStage('good')));
    const output = join(scratch, 'work', 'service');
    mkdirSync(dirname(output), { recursive: true });
    await expect(build.typeErrors()).resolves.toBe(0);
    await build.build(output);
    expect(readdirSync(dirname(output))).toEqual(['service']);
    expect(statSync(join(output, 'go2rtc', 'go2rtc')).mode & 0o777).toBe(0o700);
    expect(statSync(join(output, 'service.mjs')).mode & 0o777).toBe(0o600);
    await expect(build.checkMigrations(layout)).resolves.toEqual({
      from: STARTING_SCHEMA,
      to: NEW_SCHEMA,
    });
  });

  it('refuses a staged tree that was tampered with before the review', async () => {
    const release = writeStage('tampered');
    writeFileSync(join(release, 'files', 'service.mjs'), 'export {}\n\n');
    await expect(stagedHubBuild(stageOf(release)).typeErrors()).rejects.toMatchObject({
      reason: 'hash_mismatch',
    });
  });

  it('refuses a staged tree that changed between the review and the copy', async () => {
    const release = writeStage('changed');
    const build = stagedHubBuild(stageOf(release));
    await build.typeErrors();
    writeFileSync(join(release, 'files', 'update', 'watchdog.mjs'), 'export {}\n\n');
    const output = join(scratch, 'work', 'service');
    mkdirSync(dirname(output), { recursive: true });
    await expect(build.build(output)).rejects.toMatchObject({ reason: 'hash_mismatch' });
    expect(existsSync(output)).toBe(false);
    expect(readdirSync(dirname(output))).toEqual([]);
  });

  it('refuses a release built for another target', async () => {
    const build = stagedHubBuild(stageOf(writeStage('other', { target: OTHER })));
    await expect(build.typeErrors()).rejects.toThrow(
      `the release is built for ${OTHER}, but this Hub runs on ${HOST}`,
    );
  });

  it('refuses a release that needs another Node.js major', async () => {
    const major = Number(process.versions.node.split('.')[0]) + 1;
    const build = stagedHubBuild(
      stageOf(writeStage('node', { nodeVersion: `${String(major)}.0.0` })),
    );
    await expect(build.typeErrors()).rejects.toThrow(`the release needs Node.js ${String(major)}`);
  });

  it('refuses migrations that are not idempotent', async () => {
    const build = stagedHubBuild(stageOf(writeStage('migrations', { migration: NOT_IDEMPOTENT })));
    const output = join(scratch, 'work', 'service');
    mkdirSync(dirname(output), { recursive: true });
    await build.typeErrors();
    await build.build(output);
    await expect(build.checkMigrations(layout)).rejects.toThrow('not idempotent');
  });

  it('refuses a release whose migrations miss its declared schema', async () => {
    const short = MIGRATES.replace(`to: ${String(NEW_SCHEMA)}`, `to: ${String(NEW_SCHEMA - 1)}`);
    const build = stagedHubBuild(stageOf(writeStage('short', { migration: short })));
    const output = join(scratch, 'work', 'service');
    mkdirSync(dirname(output), { recursive: true });
    await build.typeErrors();
    await build.build(output);
    await expect(build.checkMigrations(layout)).rejects.toThrow(
      `the release declares schemas 1 to ${String(NEW_SCHEMA)}`,
    );
  });

  it('refuses a service identical to the installed one and leaves nothing behind', async () => {
    const release = writeStage('same');
    const install = join(scratch, 'install');
    const target = { install: hubInstall(install), data: layout };
    const installed = stagedHubBuild(stageOf(release));
    mkdirSync(dirname(target.install.service), { recursive: true });
    await installed.typeErrors();
    await installed.build(target.install.service);
    const paths = selfUpdatePaths(layout);
    mkdirSync(paths.work, { recursive: true });
    const jobs = {
      folder: join(paths.work, 'jobs'),
      now: (): Date => new Date(),
      newId: randomUUID,
    };
    const job = startJob(jobs, 'hub', { action: 'hub', notes: 'Same build.' }, null);
    const result = await selfUpdateHub(
      {
        data: layout.root,
        url: 'http://127.0.0.1:1',
        node: process.execPath,
        target,
        paths,
        install,
        job,
        jobs,
        ledger: paths.ledger,
        watchdogLog: paths.watchdogLog,
        now: () => new Date(),
        newId: randomUUID,
        candidate: stagedHubBuild(stageOf(release)),
      },
      'Same build.',
    );
    expect(result).toMatchObject({ status: 'refused', refusal: 'identity_same' });
    const runId = readLedger(paths.ledger).releases.at(-1)?.runId ?? '';
    expect(existsSync(join(paths.work, `${runId}-service`))).toBe(false);
    expect(existsSync(join(paths.work, `${runId}-watchdog.mjs`))).toBe(false);
  });
});
