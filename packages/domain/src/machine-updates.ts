import { z } from 'zod';

export const MACHINE_UPDATE_PLATFORMS = ['linux', 'win32', 'darwin'] as const;

export const MACHINE_UPDATE_ARCHES = ['x64', 'arm64'] as const;

export const MACHINE_UPDATE_KINDS = ['zip', 'nupkg', 'releases'] as const;

export type MachineUpdateKind = (typeof MACHINE_UPDATE_KINDS)[number];

export const MACHINE_UPDATE_FOLDER = 'machine-updates';

export const MACHINE_UPDATE_MANIFEST_FILE = 'manifest.json';

export const MACHINE_UPDATE_VERSION = z.string().regex(/^\d+\.\d+\.\d+$/u, {
  message: 'must be a version written major.minor.patch, such as 0.4.2',
});

export const MACHINE_UPDATE_FILE = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/u, {
  message: 'must be a plain file name without folders',
});

export const MACHINE_UPDATE_ARTIFACT = z.strictObject({
  platform: z.enum(MACHINE_UPDATE_PLATFORMS),
  arch: z.enum(MACHINE_UPDATE_ARCHES),
  kind: z.enum(MACHINE_UPDATE_KINDS),
  file: MACHINE_UPDATE_FILE,
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  size: z.int().positive(),
});

export type MachineUpdateArtifact = z.infer<typeof MACHINE_UPDATE_ARTIFACT>;

const KINDS_OF_PLATFORM: Readonly<
  Record<(typeof MACHINE_UPDATE_PLATFORMS)[number], readonly MachineUpdateKind[]>
> = {
  linux: ['zip'],
  darwin: ['zip'],
  win32: ['nupkg', 'releases'],
};

function artifactsOf(
  artifacts: readonly MachineUpdateArtifact[],
  platform: MachineUpdateArtifact['platform'],
  arch: MachineUpdateArtifact['arch'],
): readonly MachineUpdateArtifact[] {
  return artifacts.filter((artifact) => artifact.platform === platform && artifact.arch === arch);
}

function complete(artifacts: readonly MachineUpdateArtifact[]): boolean {
  return artifacts.every((artifact) => {
    const kinds = artifactsOf(artifacts, artifact.platform, artifact.arch).map(
      (found) => found.kind,
    );
    const expected = KINDS_OF_PLATFORM[artifact.platform];
    return kinds.length === expected.length && expected.every((kind) => kinds.includes(kind));
  });
}

export const MACHINE_UPDATE_MANIFEST = z
  .strictObject({
    version: MACHINE_UPDATE_VERSION,
    artifacts: z.array(MACHINE_UPDATE_ARTIFACT).min(1),
  })
  .refine((manifest) => complete(manifest.artifacts), {
    message:
      'each platform and architecture needs exactly its files: one zip for linux and darwin, one nupkg and one RELEASES file for win32',
  })
  .refine(
    (manifest) =>
      new Set(manifest.artifacts.map((artifact) => artifact.file)).size ===
      manifest.artifacts.length,
    { message: 'every artifact needs its own file name' },
  );

export type MachineUpdateManifest = z.infer<typeof MACHINE_UPDATE_MANIFEST>;

export const MACHINE_UPDATE_OFFER_ARTIFACT = MACHINE_UPDATE_ARTIFACT.extend({
  url: z.string().min(1),
});

export type MachineUpdateOfferArtifact = z.infer<typeof MACHINE_UPDATE_OFFER_ARTIFACT>;

export const MACHINE_UPDATE_OFFER = z.strictObject({
  version: MACHINE_UPDATE_VERSION,
  artifacts: z.array(MACHINE_UPDATE_OFFER_ARTIFACT).min(1),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type MachineUpdateOffer = z.infer<typeof MACHINE_UPDATE_OFFER>;

export const MACHINE_UPDATE_QUERY = z.strictObject({
  platform: z.enum(MACHINE_UPDATE_PLATFORMS),
  arch: z.enum(MACHINE_UPDATE_ARCHES),
});

export type MachineUpdateQuery = z.infer<typeof MACHINE_UPDATE_QUERY>;

export function machineUpdateTarget(
  manifest: MachineUpdateManifest,
  query: MachineUpdateQuery,
): readonly MachineUpdateArtifact[] {
  return artifactsOf(manifest.artifacts, query.platform, query.arch);
}

function partsOf(version: string): readonly number[] {
  return version.split('.').map(Number);
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = partsOf(candidate);
  const now = partsOf(current);
  for (const [index, part] of next.entries()) {
    const other = now[index] ?? 0;
    if (part !== other) return part > other;
  }
  return false;
}

export const MACHINE_UPDATE_STATES = [
  'none',
  'available',
  'downloading',
  'installing',
  'failed',
] as const;

export type MachineUpdateState = (typeof MACHINE_UPDATE_STATES)[number];

export const MACHINE_UPDATE_STATUS = z.strictObject({
  state: z.enum(MACHINE_UPDATE_STATES),
  version: MACHINE_UPDATE_VERSION.nullable(),
  detail: z.string(),
  installable: z.boolean(),
});

export type MachineUpdateStatus = z.infer<typeof MACHINE_UPDATE_STATUS>;
