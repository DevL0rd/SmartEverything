import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  ApiError,
  DESKTOP_RELEASE_RESULT,
  MACHINE_UPDATE_ARTIFACT,
  MACHINE_UPDATE_FILE,
  MACHINE_UPDATE_MANIFEST,
  MACHINE_UPDATE_MANIFEST_FILE,
  MACHINE_UPDATE_NOTICE,
  MACHINE_UPDATE_NOTICE_FILE,
  MACHINE_UPDATE_VERSION,
  isNewerVersion,
  type DesktopReleaseResult,
  type MachineUpdateArtifact,
  type MachineUpdateManifest,
  type ReleaseManifest,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { MachineUpdatePublisher } from '../updates/machine-update-publication';
import {
  readListed,
  readStagedRelease,
  refuse,
  ReleasePublicationRefused,
  stagedPath,
  type StagedRelease,
} from './staged-release';
import type { ReleaseStaging } from './staging';

const log = new Logger('hub.releases');

const RUNTIME_FILE = 'runtime-version.txt';

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const RESERVED = new Set([MACHINE_UPDATE_MANIFEST_FILE, MACHINE_UPDATE_NOTICE_FILE]);

type DesktopManifest = Extract<ReleaseManifest, { artifact: 'desktop' }>;

type Arch = MachineUpdateArtifact['arch'];

export interface DesktopPublicationInput {
  readonly runId: string;
  readonly upload: string;
  readonly notes: string;
  readonly arches: readonly Arch[];
}

export interface DesktopPublicationPorts {
  readonly staging: ReleaseStaging;
  readonly publisher: Pick<MachineUpdatePublisher, 'stage' | 'publish'>;
  readonly current: () => Promise<MachineUpdateManifest | null>;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function hashesOf(manifest: MachineUpdateManifest): string {
  return manifest.artifacts
    .map((artifact) => `${artifact.platform}:${artifact.arch}:${artifact.sha256}`)
    .sort()
    .join(',');
}

function checkVersion(manifest: DesktopManifest, input: DesktopPublicationInput): void {
  if (manifest.facts.version !== manifest.version)
    refuse(
      'version_mismatch',
      `The release version ${manifest.version} differs from the desktop version ${manifest.facts.version}.`,
    );
  if (!MACHINE_UPDATE_VERSION.safeParse(manifest.version).success)
    refuse('version_mismatch', `${manifest.version} is not written major.minor.patch.`);
  if (!sameSet(manifest.facts.arches, input.arches))
    refuse(
      'arches_mismatch',
      `The release holds ${manifest.facts.arches.join(', ')} and the request lists ${input.arches.join(', ')}; they must be the same.`,
    );
}

async function startsLikeZip(path: string): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const head = Buffer.alloc(ZIP_MAGIC.length);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    return bytesRead === head.length && head.equals(ZIP_MAGIC);
  } finally {
    await handle.close();
  }
}

async function artifactOf(stage: StagedRelease, arch: Arch): Promise<MachineUpdateArtifact> {
  const prefix = `${arch}/`;
  const found = stage.manifest.files.filter((file) => file.path.startsWith(prefix));
  const [zip] = found;
  if (zip === undefined || found.length !== 1 || !zip.path.endsWith('.zip'))
    refuse('bad_layout', `${prefix} must hold exactly one .zip.`);
  const file = basename(zip.path);
  if (!MACHINE_UPDATE_FILE.safeParse(file).success || RESERVED.has(file) || zip.size === 0)
    refuse('bad_layout', `${zip.path} cannot be offered as a desktop update file.`);
  if (!(await startsLikeZip(stagedPath(stage, zip.path))))
    refuse('bad_layout', `${zip.path} is not a ZIP archive.`);
  return MACHINE_UPDATE_ARTIFACT.parse({
    platform: 'linux',
    arch,
    kind: 'zip',
    file,
    sha256: zip.sha256,
    size: zip.size,
  });
}

async function runtimeOf(stage: StagedRelease): Promise<string> {
  const text = (await readListed(stage, RUNTIME_FILE)).toString('utf8').trim();
  const parsed = MACHINE_UPDATE_NOTICE.shape.runtimeVersion.safeParse(text);
  if (!parsed.success)
    refuse('bad_layout', `${RUNTIME_FILE} must hold the 32 character web runtime version.`);
  return parsed.data;
}

async function contentOf(
  stage: StagedRelease,
  input: DesktopPublicationInput,
): Promise<{ artifacts: MachineUpdateArtifact[]; runtimeVersion: string }> {
  const artifacts: MachineUpdateArtifact[] = [];
  for (const arch of input.arches) artifacts.push(await artifactOf(stage, arch));
  const allowed = new Set([
    RUNTIME_FILE,
    ...artifacts.map((artifact) => `${artifact.arch}/${artifact.file}`),
  ]);
  const extra = stage.manifest.files.find((file) => !allowed.has(file.path));
  if (extra !== undefined) refuse('bad_layout', `${extra.path} is not part of a desktop release.`);
  return { artifacts, runtimeVersion: await runtimeOf(stage) };
}

async function uploaded(
  ports: DesktopPublicationPorts,
  stage: StagedRelease,
  artifact: MachineUpdateArtifact,
): Promise<void> {
  const path = `${artifact.arch}/${artifact.file}`;
  const staged = await ports.publisher.stage(
    artifact.file,
    createReadStream(stagedPath(stage, path)),
  );
  if (staged.sha256 !== artifact.sha256 || staged.size !== artifact.size)
    refuse('file_changed', `${artifact.file} no longer matches the signed release.`);
}

function published(
  input: DesktopPublicationInput,
  manifest: MachineUpdateManifest,
  commit: string,
): DesktopReleaseResult {
  return DESKTOP_RELEASE_RESULT.parse({
    status: 'published',
    runId: input.runId,
    release: { commit, manifest },
  });
}

async function alreadyPublished(
  ports: DesktopPublicationPorts,
  next: MachineUpdateManifest,
): Promise<MachineUpdateManifest | null> {
  const current = await ports.current();
  if (current === null || isNewerVersion(next.version, current.version)) return null;
  if (current.version === next.version && hashesOf(current) === hashesOf(next)) return current;
  return refuse(
    'version_not_newer',
    `${next.version} is not newer than the published ${current.version}; raise the version, build and provide it again.`,
  );
}

async function release(
  ports: DesktopPublicationPorts,
  input: DesktopPublicationInput,
): Promise<DesktopReleaseResult> {
  const stage = await readStagedRelease(ports.staging, input.upload, 'desktop');
  const { manifest } = stage;
  if (manifest.artifact !== 'desktop')
    refuse('wrong_artifact', 'The staged release is not a desktop release.');
  checkVersion(manifest, input);
  const { artifacts, runtimeVersion } = await contentOf(stage, input);
  const next = MACHINE_UPDATE_MANIFEST.parse({
    version: manifest.version,
    artifacts,
    notes: input.notes,
  });
  let release = await alreadyPublished(ports, next);
  if (release === null) {
    for (const artifact of artifacts) await uploaded(ports, stage, artifact);
    release = await ports.publisher.publish({ manifest: next, runtimeVersion });
    log.info('release_desktop.published', {
      runId: input.runId,
      uploadId: stage.upload.uploadId,
      version: release.version,
      arches: input.arches.join(','),
      commit: manifest.commit,
    });
  }
  await ports.staging.discard(stage.upload.uploadId);
  return published(input, release, manifest.commit);
}

function refusalOf(cause: unknown): string | null {
  if (cause instanceof ReleasePublicationRefused) return `${cause.reason}: ${cause.message}`;
  if (cause instanceof ApiError && cause.code === 'invalid_request')
    return `rejected: ${cause.message}`;
  return null;
}

export async function publishStagedDesktop(
  ports: DesktopPublicationPorts,
  input: DesktopPublicationInput,
): Promise<DesktopReleaseResult> {
  try {
    return await release(ports, input);
  } catch (cause) {
    const reason = refusalOf(cause);
    if (reason === null) throw cause;
    log.warn('release_desktop.refused', { runId: input.runId, upload: input.upload, reason });
    return { status: 'refused', runId: input.runId, reason };
  }
}
