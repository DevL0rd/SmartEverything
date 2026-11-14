import {
  DESKTOP_RELEASE,
  UPDATE_DESKTOP_INPUT,
  isNewerVersion,
  type DesktopReleaseInput,
  type DesktopReleaseResult,
  type MachineUpdateManifest,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { ReleaseFile } from './release-machine-update.ts';
import {
  changeJob,
  isFinished,
  readJob,
  startJob,
  type JobStore,
  type UpdateJob,
} from './self-update-job.ts';

const DETAIL_LIMIT = 4000;
const UNFINISHED =
  'The release process ended unfinished. Check the current release, then request again with a new request ID.';

export type DesktopArch = DesktopReleaseInput['arches'][number];

export class DesktopReleaseRefused extends Error {
  override readonly name = 'DesktopReleaseRefused';
}

export class DesktopReleaseConflict extends Error {
  override readonly name = 'DesktopReleaseConflict';
}

export interface DesktopReleasePorts {
  readonly store: JobStore;
  readonly sync: () => Promise<string>;
  readonly version: () => string;
  readonly current: () => Promise<MachineUpdateManifest | null>;
  readonly prepare: () => Promise<string>;
  readonly build: (arch: DesktopArch) => Promise<string>;
  readonly publish: (
    version: string,
    files: readonly ReleaseFile[],
    metadata: { readonly notes: string; readonly runtimeVersion: string },
  ) => Promise<MachineUpdateManifest>;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, DETAIL_LIMIT);
}

function sameRequest(held: DesktopReleaseInput, input: DesktopReleaseInput): boolean {
  return (
    held.runId === input.runId &&
    held.notes === input.notes &&
    held.commit === input.commit &&
    held.arches.length === input.arches.length &&
    held.arches.every((arch, index) => arch === input.arches[index])
  );
}

function resultOf(job: UpdateJob): DesktopReleaseResult | null {
  if (job.phase === 'published')
    return {
      status: 'published',
      runId: job.runId,
      release: DESKTOP_RELEASE.parse(job.result),
    };
  if (job.phase === 'refused' || job.phase === 'failed')
    return { status: job.phase, runId: job.runId, reason: z.string().min(1).parse(job.detail) };
  return null;
}

function end(
  store: JobStore,
  job: UpdateJob,
  phase: 'refused' | 'failed',
  detail: string,
): DesktopReleaseResult {
  changeJob(store, job, { phase, detail });
  return { status: phase, runId: job.runId, reason: detail };
}

function settled(store: JobStore, job: UpdateJob): DesktopReleaseResult {
  const result = resultOf(job);
  if (result !== null) return result;
  return end(store, job, 'failed', UNFINISHED);
}

async function checkedCommit(ports: DesktopReleasePorts): Promise<string> {
  try {
    return await ports.sync();
  } catch (cause) {
    throw new DesktopReleaseRefused(`preflight: ${errorText(cause)}`);
  }
}

async function requireNewer(ports: DesktopReleasePorts, version: string): Promise<void> {
  const current = await ports.current();
  if (current !== null && !isNewerVersion(version, current.version))
    throw new DesktopReleaseRefused(
      `version_not_newer: apps/desktop/package.json is ${version} and ${current.version} is already published; raise the version, commit and push first.`,
    );
}

function verifiedReadback(
  manifest: MachineUpdateManifest,
  readback: MachineUpdateManifest | null,
): void {
  const hashes = (value: MachineUpdateManifest): string =>
    value.artifacts
      .map((artifact) => `${artifact.platform}:${artifact.arch}:${artifact.sha256}`)
      .sort()
      .join(',');
  if (readback?.version !== manifest.version || hashes(readback) !== hashes(manifest))
    throw new Error(
      `The hub does not report the published release ${manifest.version} as current.`,
    );
}

async function buildAll(
  ports: DesktopReleasePorts,
  arches: readonly DesktopArch[],
  mark: (text: string) => void,
): Promise<readonly ReleaseFile[]> {
  const files: ReleaseFile[] = [];
  for (const arch of arches) {
    files.push({ platform: 'linux', arch, kind: 'zip', path: await ports.build(arch) });
    mark(`built linux ${arch}`);
  }
  return files;
}

async function release(
  ports: DesktopReleasePorts,
  job: UpdateJob,
  input: DesktopReleaseInput,
): Promise<UpdateJob> {
  let current = job;
  const mark = (text: string): void => {
    current = changeJob(ports.store, current, { steps: [...current.steps, text] });
  };
  const commit = await checkedCommit(ports);
  mark(`publishing commit ${commit}`);
  const version = ports.version();
  await requireNewer(ports, version);
  const runtimeVersion = await ports.prepare();
  mark('built the web bundle and the desktop shell');
  const files = await buildAll(ports, input.arches, mark);
  const manifest = await ports.publish(version, files, { notes: input.notes, runtimeVersion });
  verifiedReadback(manifest, await ports.current());
  return changeJob(ports.store, current, {
    phase: 'published',
    result: DESKTOP_RELEASE.parse({ commit, manifest }),
  });
}

async function execute(
  ports: DesktopReleasePorts,
  job: UpdateJob,
  input: DesktopReleaseInput,
): Promise<DesktopReleaseResult> {
  const running = changeJob(ports.store, job, { phase: 'running' });
  try {
    return (
      resultOf(await release(ports, running, input)) ??
      end(ports.store, running, 'failed', UNFINISHED)
    );
  } catch (error) {
    const phase = error instanceof DesktopReleaseRefused ? 'refused' : 'failed';
    return end(ports.store, readJob(ports.store, job.runId) ?? running, phase, errorText(error));
  }
}

export async function runDesktopRelease(
  input: DesktopReleaseInput,
  ports: DesktopReleasePorts,
): Promise<DesktopReleaseResult> {
  const checked = UPDATE_DESKTOP_INPUT.parse(input);
  const existing = readJob(ports.store, checked.runId);
  if (existing === null)
    return execute(ports, startJob(ports.store, 'desktop', checked, null), checked);
  if (
    existing.action !== 'desktop' ||
    !sameRequest(UPDATE_DESKTOP_INPUT.parse(existing.input), checked)
  )
    throw new DesktopReleaseConflict('This request ID is already in use for a different update.');
  return settled(ports.store, existing);
}

export function readDesktopRelease(runId: string, store: JobStore): DesktopReleaseResult | null {
  const job = readJob(store, runId);
  if (job?.action !== 'desktop') return null;
  return isFinished(job) ? resultOf(job) : settled(store, job);
}
