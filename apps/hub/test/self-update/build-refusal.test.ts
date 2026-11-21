import { openSeededStore, closedStore } from '../support/store';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ApiError, type UpdateRevision } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubLayout } from '../../src/data-layout';
import {
  HubBuildRefusedError,
  runConfiguredUpdateCommand,
  runUpdateCommand,
  UpdateUnavailableError,
} from '../../src/self-update/command';
import {
  executeHub,
  executePublication,
  type StepDependencies,
} from '../../src/self-update/pipeline-steps';
import { startConfiguredSource } from '../../src/self-update/source';
import { testLogger } from '../support/logs';
import { testLayout } from '../support/test-layout';
import { testStoreHost } from '../support/store-host';

const RUN = '00000000-0000-4000-8000-000000000001';
const AT = '2026-11-14T10:00:00.000Z';
const TIP = 'c'.repeat(40);
const OWNER = '00000000-0000-4000-8000-0000000000ff';
const NO_SOURCE = /no update checkout/u;
const DEV_MACHINE = /build source is provided, not hub\. Build it on a dev machine/u;

const REVISION: UpdateRevision = {
  id: '00000000-0000-4000-8000-0000000000aa',
  tip: TIP,
  pushedFrom: null,
  base: null,
  changedPaths: null,
  status: 'running',
  steps: [],
  notes: 'Notes',
  failure: null,
  receivedAt: AT,
  updatedAt: AT,
  finishedAt: null,
};

const step = {
  component: 'hub',
  status: 'running',
  runId: RUN,
  offered: false,
  detail: null,
} as const;

let scratch: string;
let layout: HubLayout;
let deps: StepDependencies;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'build-refusal-'));
  layout = await testLayout(scratch);
  await mkdir(dirname(layout.system.database.file), { recursive: true });
  await closedStore(
    await openSeededStore({
      host: testStoreHost(),
      path: layout.system.database.file,
      log: testLogger('store'),
      now: () => new Date(AT),
      systemTimeZone: 'UTC',
      driveFolders: null,
    }),
  );
  deps = {
    layout,
    publicServer: (): Promise<string> => Promise.resolve('https://home.example'),
    finished: (): Promise<never> =>
      Promise.reject(new Error('A refused build must not be awaited.')),
  };
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('update_control builds', () => {
  it('refuses the hub action before it looks for a checkout', async () => {
    const refused = runUpdateCommand(layout, {
      action: 'hub',
      source: 'hub',
      notes: 'Repair startup',
    });
    await expect(refused).rejects.toBeInstanceOf(HubBuildRefusedError);
    await expect(refused).rejects.toThrow(/The Hub does not build the Hub service/u);
    await expect(refused).rejects.toThrow(DEV_MACHINE);
  });

  it.each([
    ['self-update-app-command.ts', 'app', 'the Android app'],
    ['self-update-app-command.ts', 'ui', 'the app UI update'],
    ['self-update-desktop-command.ts', 'desktop', 'the Desktop release'],
  ] as const)('refuses %s for %s', async (script, action, name) => {
    const input = { input: { action, runId: RUN, notes: 'Notes' }, server: 'https://home.example' };
    const refused = runConfiguredUpdateCommand(script, layout, input);
    await expect(refused).rejects.toBeInstanceOf(HubBuildRefusedError);
    await expect(refused).rejects.toThrow(`The Hub does not build ${name}`);
    await expect(refused).rejects.toThrow(DEV_MACHINE);
  });

  it.each(['self-update-app-command.ts', 'self-update-desktop-command.ts'] as const)(
    'refuses a %s request of any other shape',
    async (script) => {
      await expect(
        runConfiguredUpdateCommand(script, layout, { input: { action: 'other' } }),
      ).rejects.toBeInstanceOf(HubBuildRefusedError);
    },
  );

  it('reports the refusal as an unavailable update', async () => {
    await expect(
      runUpdateCommand(layout, { action: 'hub', source: 'hub', notes: 'Notes' }),
    ).rejects.toBeInstanceOf(UpdateUnavailableError);
  });

  it.each([
    ['provided', { source: 'provided', upload: RUN }],
    ['github', { source: 'github', tag: 'v1.0.0' }],
  ] as const)('lets a %s hub release past the gate', async (_name, extra) => {
    const release = runUpdateCommand(layout, { action: 'hub', notes: 'Notes', ...extra });
    await expect(release).rejects.not.toBeInstanceOf(HubBuildRefusedError);
  });
});

describe('status and recover', () => {
  it.each([
    { action: 'recover', id: RUN, holdSeconds: 120 },
    { action: 'rollback', artifact: 'hub', id: RUN },
  ] as const)('runs $action from the installed service, not the update checkout', async (input) => {
    const run = runUpdateCommand(layout, input);
    await expect(run).rejects.toThrow('no update/hub-command.mjs');
    await expect(run).rejects.not.toThrow(NO_SOURCE);
    await expect(run).rejects.not.toBeInstanceOf(HubBuildRefusedError);
  });

  it.each([
    { action: 'hub', source: 'provided', upload: RUN },
    { action: 'hub', source: 'github', tag: 'v1.0.0' },
  ] as const)('runs a $source hub release from the installed service', async (input) => {
    await expect(runUpdateCommand(layout, { ...input, notes: 'Notes' })).rejects.toThrow(
      'no update/hub-command.mjs',
    );
  });

  it.each(['self-update-app-command.ts', 'self-update-desktop-command.ts'] as const)(
    'lets a %s status request through to the update checkout',
    async (script) => {
      const status = runConfiguredUpdateCommand(script, layout, { runId: RUN });
      await expect(status).rejects.toThrow(NO_SOURCE);
      await expect(status).rejects.not.toBeInstanceOf(HubBuildRefusedError);
    },
  );
});

describe('the Updates page Git source apply', () => {
  it('refuses the remote apply with the reason', async () => {
    const refused = startConfiguredSource(layout, OWNER, {
      offerId: RUN,
      requestId: RUN,
      includePending: false,
    });
    await expect(refused).rejects.toBeInstanceOf(ApiError);
    await expect(refused).rejects.toThrow(DEV_MACHINE);
  });
});

describe('the push pipeline', () => {
  it('refuses to start a Hub step that has no release yet', async () => {
    const outcome = await executeHub(deps, REVISION, step);
    expect(outcome).toMatchObject({ status: 'failed', rollback: 'none' });
    expect(JSON.stringify(outcome)).toMatch(DEV_MACHINE);
  });

  it.each(['app', 'ui', 'desktop'] as const)(
    'refuses the %s publication step',
    async (component) => {
      const outcome = await executePublication(deps, REVISION, { ...step, component });
      expect(outcome).toMatchObject({ status: 'failed', rollback: 'none' });
      expect(JSON.stringify(outcome)).toMatch(DEV_MACHINE);
    },
  );
});
