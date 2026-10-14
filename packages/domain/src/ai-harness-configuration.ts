import { z } from 'zod';
import { AI_HARNESS_TARGET, AI_HARNESS_TARGET_WRITE, type AiHarnessHost } from './ai-harness';
import { JSON_VALUE } from './values';

const IDENTITY = z.string().min(1).max(200);
const VERSION = z.string().min(1).max(100);
export const HARNESS_ARTIFACT_INTEGRITY = z
  .string()
  .max(200)
  .regex(/^(sha256-[A-Za-z0-9+/]{43}=|sha384-[A-Za-z0-9+/]{64}|sha512-[A-Za-z0-9+/]{86}==)$/);
export const HARNESS_ARTIFACT_SOURCE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('builtin'), identity: IDENTITY }),
  z.strictObject({ kind: z.literal('artifact'), url: z.url({ protocol: /^https$/ }).max(4096) }),
]);
export const HARNESS_SKILL_ASSET = z.strictObject({
  id: IDENTITY,
  version: VERSION,
  source: HARNESS_ARTIFACT_SOURCE,
  integrity: HARNESS_ARTIFACT_INTEGRITY,
  entrypoint: z
    .string()
    .min(1)
    .max(4096)
    .refine(relativeAssetPath, 'Expected a confined relative asset path.'),
});
export const HARNESS_PLUGIN_METADATA = z.strictObject({
  source: HARNESS_ARTIFACT_SOURCE,
  integrity: HARNESS_ARTIFACT_INTEGRITY,
  provenance: z.string().min(1).max(2000),
  platforms: z
    .array(z.enum(['linux', 'macos', 'windows', 'android']))
    .min(1)
    .max(4)
    .refine(
      (platforms) => new Set(platforms).size === platforms.length,
      'Platforms must be unique.',
    ),
  dsh_version: VERSION,
  runtime_version: VERSION,
  server_safe: z.boolean(),
  adapter: z.strictObject({
    id: IDENTITY,
    version: VERSION,
    kind: z.enum(['backend', 'tools', 'skills', 'smarteverything-ui']),
  }),
  skill_assets: z
    .array(HARNESS_SKILL_ASSET)
    .max(1000)
    .refine(uniqueAssetIds, 'Skill asset identifiers must be unique.'),
});
export const HARNESS_DESIRED_ENTRY = z.strictObject({
  id: IDENTITY,
  package: IDENTITY,
  version: VERSION,
  enabled: z.boolean(),
  config: z.record(z.string(), JSON_VALUE),
  metadata: HARNESS_PLUGIN_METADATA.optional(),
});
export const HARNESS_DESIRED_CONFIGURATION = z
  .strictObject({ revision: IDENTITY, entries: z.array(HARNESS_DESIRED_ENTRY).max(200) })
  .refine((value) => uniqueAssetIds(value.entries), 'Plugin identifiers must be unique.');
export type HarnessDesiredEntry = z.infer<typeof HARNESS_DESIRED_ENTRY>;
export type HarnessDesiredConfiguration = z.infer<typeof HARNESS_DESIRED_CONFIGURATION>;
export type HarnessPluginMetadata = z.infer<typeof HARNESS_PLUGIN_METADATA>;
export type HarnessSkillAsset = z.infer<typeof HARNESS_SKILL_ASSET>;

export const HARNESS_PLUGIN_READINESS = z.strictObject({
  id: IDENTITY,
  package: IDENTITY,
  requestedVersion: VERSION,
  installedVersion: VERSION.nullable(),
  provenance: z.string().min(1).max(2000).nullable(),
  state: z.enum(['ready', 'disabled', 'missing', 'incompatible', 'failed', 'pending']),
  reason: z.string().min(1).max(2000).nullable(),
  installedMetadata: HARNESS_PLUGIN_METADATA.nullable().optional(),
});
export type HarnessPluginReadiness = z.infer<typeof HARNESS_PLUGIN_READINESS>;
export const AI_HARNESS_CONFIGURATION_REPORT = z.strictObject({
  target: AI_HARNESS_TARGET_WRITE,
  runtime_instance: z.uuid(),
  connection_generation: z.uuid(),
  revision: IDENTITY,
  pending_revision: IDENTITY.optional(),
  readiness: z
    .array(HARNESS_PLUGIN_READINESS)
    .max(200)
    .refine(uniqueAssetIds, 'Reported plugin identifiers must be unique.'),
  reported_at: z.iso.datetime({ offset: true }),
});
export type AiHarnessConfigurationReport = z.infer<typeof AI_HARNESS_CONFIGURATION_REPORT>;
export const AI_HARNESS_CONFIGURATION_STORED_REPORT = AI_HARNESS_CONFIGURATION_REPORT.extend({
  received_at: z.iso.datetime({ offset: true }),
});
export type AiHarnessConfigurationStoredReport = z.infer<
  typeof AI_HARNESS_CONFIGURATION_STORED_REPORT
>;
export const AI_HARNESS_CONFIGURATION_REPLACE = z.strictObject({
  expected_revision: IDENTITY,
  configuration: HARNESS_DESIRED_CONFIGURATION,
});
export const AI_HARNESS_CONFIGURATION_HOST_STATUS = z.object({
  target: AI_HARNESS_TARGET,
  online: z.boolean(),
  runtime_instance: z.uuid(),
  connection_generation: z.uuid(),
  report: AI_HARNESS_CONFIGURATION_STORED_REPORT.nullable(),
  freshness: z.enum(['current', 'stale', 'unreported', 'offline', 'unsupported']),
});
export type AiHarnessConfigurationHostStatus = z.infer<typeof AI_HARNESS_CONFIGURATION_HOST_STATUS>;
export const AI_HARNESS_CONFIGURATION_CATALOGUE = z.object({
  desired: HARNESS_DESIRED_CONFIGURATION,
  hosts: z.array(AI_HARNESS_CONFIGURATION_HOST_STATUS).max(1000),
});
export type AiHarnessConfigurationCatalogue = z.infer<typeof AI_HARNESS_CONFIGURATION_CATALOGUE>;

export function deriveHarnessConfigurationHostStatus(
  host: AiHarnessHost,
  desired: HarnessDesiredConfiguration,
  report: AiHarnessConfigurationStoredReport | null,
): AiHarnessConfigurationHostStatus {
  const identity = {
    target: host.target,
    online: host.online,
    runtime_instance: host.runtime_instance,
    connection_generation: host.connection_generation,
    report,
  };
  if (host.configuration_sync !== true) return { ...identity, freshness: 'unsupported' };
  if (!host.online) return { ...identity, freshness: 'offline' };
  if (report === null) return { ...identity, freshness: 'unreported' };
  const current =
    report.runtime_instance === host.runtime_instance &&
    report.connection_generation === host.connection_generation &&
    report.revision === desired.revision &&
    report.pending_revision === undefined &&
    JSON.stringify(report.target) === JSON.stringify(host.target);
  return { ...identity, freshness: current ? 'current' : 'stale' };
}

function uniqueAssetIds(entries: readonly { readonly id: string }[]): boolean {
  return new Set(entries.map((entry) => entry.id)).size === entries.length;
}

function relativeAssetPath(value: string): boolean {
  return (
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.includes(':') &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}
