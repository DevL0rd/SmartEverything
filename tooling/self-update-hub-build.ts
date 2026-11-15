import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { nodeToolCommand, pnpmProgram } from './build-host.ts';
import { requireHubSource } from './hub-build-gate.ts';
import { commitOf, gitSourceText, HubSourceError } from './hub-update-source.ts';
import {
  ReleaseStepError,
  serviceMigrationCheck,
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

const BUILD_FAILURE_TAIL = 2000;

function request(
  root: string,
  name: string,
  program: string,
  args: readonly string[],
): StepRequest {
  return {
    tag: 'self-update hub',
    environment: {},
    steps: [{ name, cwd: root, program, args: [...args] }],
  };
}

function toolRequest(
  root: string,
  name: string,
  script: string,
  args: readonly string[],
): StepRequest {
  const tool = nodeToolCommand(script);
  return request(root, name, tool.program, [...tool.args, ...args]);
}

function typeScriptRequest(root: string, args: readonly string[]): StepRequest {
  return request(root, 'check hub types', process.execPath, [
    join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...args,
  ]);
}

function localTypeErrors(root: string, run: RunSteps): number {
  const result = run(typeScriptRequest(root, ['-p', 'apps/hub', '--noEmit']));
  if (result.status === 0) return 0;
  const count = countHubTypeErrors(result.output);
  if (count === 0)
    throw new Error(
      `The hub type check did not complete successfully: ${result.output.slice(-BUILD_FAILURE_TAIL)}`,
    );
  return count;
}

function serviceBuild(root: string, output: string): StepRequest {
  return toolRequest(root, 'build service', 'tooling/build-service.ts', ['--out', output]);
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

export function localHubBuild(
  layout: HubLayout,
  root: string,
  run: RunSteps,
  node: string,
): HubBuild {
  requireHubSource(layout, 'hub');
  let reviewed: string | undefined;
  let built: string | undefined;
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
        built = output;
      }),
    checkMigrations: (target): Promise<MigrationCheck> =>
      prepare(() => {
        if (built === undefined) throw new Error('Build the service before checking it.');
        return serviceMigrationCheck(node, built, target);
      }),
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

export function approvedRemoteHubBuild(
  layout: HubLayout,
  input: unknown,
  run: RunSteps,
  node: string,
): HubBuild {
  requireHubSource(layout, 'hub');
  const candidate = APPROVED_CANDIDATE.parse(input);
  const { root, source } = candidate;
  const checkouts = [root, source];
  let built: string | undefined;
  return {
    typeErrors: async (): Promise<number> => {
      await verifyCandidate(candidate);
      candidateStep(
        run,
        request(root, 'install frozen dependencies', pnpmProgram(), [
          'install',
          '--frozen-lockfile',
          '--prefer-offline',
        ]),
      );
      await verifyCandidate(candidate);
      candidateStep(run, typeScriptRequest(root, ['-b', 'apps/hub']));
      await verifyCandidate(candidate);
      return 0;
    },
    build: async (output): Promise<void> => {
      await verifyCandidate(candidate);
      assertCandidateDestination(checkouts, output, true);
      candidateStep(run, serviceBuild(root, output));
      await verifyCandidate(candidate);
      built = output;
    },
    checkMigrations: async (target): Promise<MigrationCheck> => {
      await verifyCandidate(candidate);
      if (built === undefined) throw new Error('Build the service before checking it.');
      const result = serviceMigrationCheck(node, built, target);
      await verifyCandidate(candidate);
      return result;
    },
  };
}
