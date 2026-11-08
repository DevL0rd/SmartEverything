import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { commitOf, gitSourceText, HubSourceError } from './hub-update-source.ts';
import {
  checkMigrations,
  dataLayoutOf,
  ReleaseStepError,
  schemaVersionOf,
  vacuumInto,
  type MigrationCheck,
} from './release-hub-files.ts';
import {
  assertCandidateDestination,
  candidateIdentity,
  isolatedCandidateRoot,
} from './self-update-candidate-identity.ts';
import type { StepOutcome, StepRequest } from './self-update-commands.ts';
import { countHubTypeErrors } from './self-update-preflight.ts';

export interface HubBuild {
  readonly typeErrors: () => Promise<number>;
  readonly build: (output: string) => Promise<void>;
  readonly checkMigrations: (layout: HubLayout) => Promise<MigrationCheck>;
}

type RunSteps = (request: StepRequest) => StepOutcome;

const ABSOLUTE_PATH = z.string().refine(isAbsolute);
const APPROVED_CANDIDATE = z.strictObject({
  source: ABSOLUTE_PATH,
  root: ABSOLUTE_PATH,
  tip: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
  identity: z.string().regex(/^[a-f0-9]{64}$/u),
});
type ApprovedCandidate = z.infer<typeof APPROVED_CANDIDATE>;

const MIGRATION_CHECK = z.strictObject({
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
});
const BUILD_FAILURE_TAIL = 2000;

function request(
  root: string,
  name: string,
  args: string[],
  kind: 'tsc' | null = null,
): StepRequest {
  return {
    tag: 'self-update hub',
    environment: {},
    steps: [{ name, cwd: root, program: 'pnpm', args, kind }],
  };
}

function localTypeErrors(root: string, run: RunSteps): number {
  const result = run(
    request(root, 'check hub types', ['exec', 'tsc', '-p', 'apps/hub', '--noEmit'], 'tsc'),
  );
  if (result.status === 0) return 0;
  const count = countHubTypeErrors(result.output);
  if (count === 0) throw new Error('The hub type check did not complete successfully.');
  return count;
}

function serviceBuild(root: string, output: string): StepRequest {
  return request(root, 'build service', [
    'exec',
    'tsx',
    'tooling/build-service.ts',
    '--out',
    output,
  ]);
}

async function headOf(root: string): Promise<string> {
  return commitOf(
    await gitSourceText(root, ['rev-parse', '--verify', 'HEAD'], 'read the source commit'),
  );
}

async function sourceIdentity(root: string): Promise<string> {
  const head = await headOf(root);
  return JSON.stringify([head, await candidateIdentity(root, 'watch')]);
}

export function localHubBuild(root: string, run: RunSteps): HubBuild {
  let reviewed: string | undefined;
  async function stableSource(): Promise<void> {
    const current = await sourceIdentity(root);
    reviewed ??= current;
    if (current !== reviewed)
      throw new HubSourceError(
        'changed',
        'The local checkout changed while the hub update was being prepared. Start the update again.',
      );
  }
  async function prepare<T>(step: () => Promise<T> | T): Promise<T> {
    await stableSource();
    const result = await step();
    await stableSource();
    return result;
  }
  return {
    typeErrors: (): Promise<number> => prepare(() => localTypeErrors(root, run)),
    build: (output): Promise<void> =>
      prepare(() => {
        assertCandidateDestination([root], output, true);
        const result = run(serviceBuild(root, output));
        if (result.status !== 0)
          throw new Error(`the service build failed: ${result.output.slice(-BUILD_FAILURE_TAIL)}`);
      }),
    checkMigrations: (layout): Promise<MigrationCheck> => prepare(() => checkMigrations(layout)),
  };
}

async function verifyCandidate(candidate: ApprovedCandidate): Promise<void> {
  const { root, source, tip, identity } = candidate;
  if (isolatedCandidateRoot(source, root) !== root)
    throw new HubSourceError('changed', 'The approved checkout moved.');
  const head = await headOf(root);
  if (head !== tip || (await candidateIdentity(root)) !== identity)
    throw new HubSourceError(
      'changed',
      'The approved checkout changed. Prepare and review it again.',
    );
}

function candidateStep(run: RunSteps, step: StepRequest): string {
  const result = run({ ...step, environment: { CI: '1' } });
  if (result.status !== 0) {
    const name = step.steps[0]?.name ?? 'candidate preparation';
    throw new ReleaseStepError(
      name,
      `the approved checkout exited with status ${String(result.status)}`,
    );
  }
  return result.output;
}

function checkResult(output: string, from: number): MigrationCheck {
  const line = output.split('\n').findLast((value) => value.trimStart().startsWith('{"from":'));
  if (line === undefined) {
    throw new ReleaseStepError(
      'migration check',
      'the approved checkout returned no schema result',
    );
  }
  const result = MIGRATION_CHECK.parse(JSON.parse(line));
  if (result.from !== from || result.to < from) {
    throw new ReleaseStepError(
      'migration check',
      `expected schema ${String(from)} or newer, got ${String(result.from)} → ${String(result.to)}`,
    );
  }
  return result;
}

function checkCandidateMigrations(
  layout: HubLayout,
  root: string,
  scratchRoot: string,
  run: RunSteps,
): MigrationCheck {
  mkdirSync(scratchRoot, { recursive: true, mode: 0o700 });
  const scratch = mkdtempSync(join(scratchRoot, 'candidate-migrations-'));
  try {
    const copy = dataLayoutOf(scratch).system.database.file;
    mkdirSync(dirname(copy), { recursive: true });
    vacuumInto(layout.system.database.file, copy);
    const from = schemaVersionOf(copy);
    const step = request(root, 'check candidate migrations', [
      'exec',
      'tsx',
      'tooling/release-hub.ts',
      'check',
      '--data',
      scratch,
    ]);
    return checkResult(candidateStep(run, step), from);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function approvedRemoteHubBuild(
  input: unknown,
  scratchRoot: string,
  run: RunSteps,
): HubBuild {
  const candidate = APPROVED_CANDIDATE.parse(input);
  const { root, source } = candidate;
  const checkouts = [root, source];
  return {
    typeErrors: async (): Promise<number> => {
      await verifyCandidate(candidate);
      candidateStep(
        run,
        request(root, 'install frozen dependencies', [
          'install',
          '--frozen-lockfile',
          '--prefer-offline',
        ]),
      );
      await verifyCandidate(candidate);
      candidateStep(
        run,
        request(root, 'check hub types', ['exec', 'tsc', '-b', 'apps/hub'], 'tsc'),
      );
      await verifyCandidate(candidate);
      return 0;
    },
    build: async (output): Promise<void> => {
      await verifyCandidate(candidate);
      assertCandidateDestination(checkouts, output, true);
      candidateStep(run, serviceBuild(root, output));
      await verifyCandidate(candidate);
    },
    checkMigrations: async (layout): Promise<MigrationCheck> => {
      await verifyCandidate(candidate);
      assertCandidateDestination(checkouts, scratchRoot, false);
      const result = checkCandidateMigrations(layout, root, scratchRoot, run);
      await verifyCandidate(candidate);
      return result;
    },
  };
}
