import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HUB_UPDATE_BOOT_RECEIPT_FILE } from '@smarteverything/domain';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { hubInstall } from '../release-hub-files.ts';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import { writeUpdateSource } from './update-source-fixture.ts';
import { readLedger, selfUpdatePaths } from '../self-update-files.ts';
import { admitRemoteSnapshot, previousRemoteRun } from '../self-update-remote.ts';
import { startRemotePreparation } from '../self-update-remote-start.ts';

vi.mock('../self-update-remote-start.ts', () => ({ startRemotePreparation: vi.fn() }));

const request = {
  action: 'remote',
  requestId: 'f5218079-899a-4966-b978-d784ce94c02e',
  offerId: 'ef0aec37-2081-4472-9dac-3fcf701b34ca',
  ownerClient: '38711789-95ba-42ab-ac91-d82a24f62ba6',
  includePending: false,
} as const;

let scratch: string;

function writeOffer(work: string, ownerClient: string, offerId: string): void {
  writeFileSync(
    join(work, `source-offer-${ownerClient}.json`),
    JSON.stringify({
      offerId,
      ownerClient,
      pending: 'a'.repeat(64),
      offer: {
        source: { folder: process.cwd(), branch: 'main', remote: 'origin' },
        head: 'a'.repeat(40),
        tip: 'b'.repeat(40),
        remoteIdentity: 'b'.repeat(64),
        hasPendingFiles: false,
      },
    }),
  );
}

async function environment(): Promise<Parameters<typeof admitRemoteSnapshot>[0]> {
  const layout = await testLayout(join(scratch, 'data'));
  writeUpdateSource(layout.root, { checkout: process.cwd() });
  const data = layout.root;
  const install = join(scratch, 'install');
  const paths = selfUpdatePaths(layout);
  const now = (): Date => new Date('2026-11-05T00:00:00Z');
  const newId = (): string => request.requestId;
  mkdirSync(paths.work, { recursive: true });
  writeOffer(paths.work, request.ownerClient, request.offerId);
  return {
    data,
    install,
    paths,
    now,
    newId,
    url: 'http://127.0.0.1:1',
    ledger: paths.ledger,
    watchdogLog: paths.watchdogLog,
    node: process.execPath,
    target: { install: hubInstall(install), data: layout },
    jobs: { folder: join(paths.work, 'jobs'), now, newId },
    runSteps: vi.fn(),
    candidate: { typeErrors: vi.fn(), build: vi.fn(), checkMigrations: vi.fn() },
  };
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'hub-remote-admission-'));
  vi.mocked(startRemotePreparation).mockReset();
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

it('records the admitted request before dispatching preparation and returns without a build', async () => {
  const tools = await environment();
  vi.mocked(startRemotePreparation).mockImplementation(() => {
    expect(readLedger(tools.ledger).releases[0]).toMatchObject({
      phase: 'planned',
      runId: request.requestId,
      remoteTip: 'b'.repeat(40),
    });
  });
  const accepted = admitRemoteSnapshot(tools, request);
  expect(accepted).toEqual({ status: 'started', runId: request.requestId });
  expect(previousRemoteRun(tools.jobs, request, readLedger(tools.ledger))).toEqual(accepted);
  expect(startRemotePreparation).toHaveBeenCalledOnce();
  expect(tools.candidate.typeErrors).not.toHaveBeenCalled();
});

it('returns the same refusal when retrying an admitted request whose dispatch failed', async () => {
  const tools = await environment();
  vi.mocked(startRemotePreparation).mockImplementation(() => {
    throw new Error('fixture failure');
  });
  const rejected = admitRemoteSnapshot(tools, request);
  expect(rejected).toMatchObject({
    status: 'refused',
    refusal: 'failed',
    runId: request.requestId,
  });
  const ledger = readLedger(tools.ledger);
  expect(ledger.releases[0]?.phase).toBe('failed');
  expect(previousRemoteRun(tools.jobs, request, ledger)).toEqual(rejected);
  expect(startRemotePreparation).toHaveBeenCalledOnce();
});

it('refuses a new request for the installed tip and preserves the original request receipt', async () => {
  const tools = await environment();
  const ownerClient = '0282bfa7-712d-4760-8fc3-d92775bdbd3f';
  const offerId = '26d2c149-5e84-4c04-a494-cd457909a941';
  writeOffer(tools.paths.work, ownerClient, offerId);
  const accepted = admitRemoteSnapshot(tools, request);
  mkdirSync(tools.target.install.service, { recursive: true });
  writeFileSync(
    join(tools.target.install.service, HUB_UPDATE_BOOT_RECEIPT_FILE),
    JSON.stringify({ runId: request.requestId }),
  );
  const repeat = { ...request, ownerClient, offerId, requestId: offerId };
  expect(admitRemoteSnapshot(tools, repeat)).toMatchObject({
    status: 'refused',
    refusal: 'identity_same',
    runId: repeat.requestId,
  });
  const ledger = readLedger(tools.ledger);
  expect(ledger.releases).toHaveLength(1);
  expect(previousRemoteRun(tools.jobs, request, ledger)).toEqual(accepted);
  expect(startRemotePreparation).toHaveBeenCalledOnce();
});

it('places the self-update work, ledger and watchdog log through the data layout', async () => {
  const layout = await testLayout(join(scratch, 'layout'));
  const paths = selfUpdatePaths(layout);
  expect(paths.work).toBe(layout.system.updates.selfUpdate);
  expect(paths.log).toBe(layout.system.logs.hubUpdateWatchdog);
  expect(paths.ledger.startsWith(layout.system.updates.selfUpdate)).toBe(true);
  expect(paths.watchdogLog.startsWith(layout.system.updates.selfUpdate)).toBe(true);
  expect(paths.step.startsWith(layout.system.updates.selfUpdate)).toBe(true);
});
