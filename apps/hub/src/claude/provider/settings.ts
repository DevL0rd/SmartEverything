import type { Query, Settings } from '@anthropic-ai/claude-agent-sdk';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import generated from './settings-schema.json';
import { ProviderInputError } from './input';

type Flags = Parameters<Query['applyFlagSettings']>[0];
const REASON =
  'Subscription authentication stays in the official local CLI; provider redirection and credential injection are excluded.';
export const SETTINGS_EXCLUSIONS: Record<string, string> = {
  apiKeyHelper: REASON,
  proxyAuthHelper: REASON,
  awsCredentialExport: REASON,
  awsAuthRefresh: REASON,
  gcpAuthRefresh: REASON,
  forceLoginMethod: REASON,
  forceLoginGatewayUrl: REASON,
  forceLoginOrgUUID: REASON,
  allowedProviders: REASON,
  modelOverrides: REASON,
  processWrapper:
    'The host owns the unmodified official CLI executable and subscription environment.',
  policyHelper:
    'Organization-managed policy belongs to the local official CLI administrator, not a chat flag.',
  disableAllHooks: 'The immutable SDK home-tool grant requires the host PreToolUse hook.',
  allowManagedHooksOnly: 'The immutable SDK home-tool grant requires the host PreToolUse hook.',
  strictPluginOnlyCustomization:
    'This flag can disable the host-owned immutable home-tool permission hook.',
  managedMcpServers:
    'Managed servers belong to organization policy; configure native transports with set_mcp_servers while preserving home.',
  'env.authentication':
    'Authentication, provider, proxy credential, executable/config-root and host-hook override environment keys are rejected; other environment settings are supported.',
};
const ORIGINAL = z
  .looseObject({
    properties: z.record(z.string(), z.record(z.string(), JSON_VALUE)),
    definitions: z.record(z.string(), JSON_VALUE).optional(),
  })
  .parse(generated);
const properties = Object.fromEntries(
  Object.entries(ORIGINAL.properties)
    .filter(([key]) => SETTINGS_EXCLUSIONS[key] === undefined)
    .map(([key, schema]) => [key, { anyOf: [schema, { type: 'null' }] }]),
);
properties['effortLevel'] = {
  anyOf: [{ enum: ['low', 'medium', 'high', 'xhigh', 'max'] }, { type: 'null' }],
};
export const FLAG_SETTINGS_SCHEMA = z.record(z.string(), JSON_VALUE).parse({
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties,
  additionalProperties: false,
  ...(ORIGINAL.definitions === undefined ? {} : { definitions: ORIGINAL.definitions }),
});
const validator = z.fromJSONSchema(FLAG_SETTINGS_SCHEMA);
const FLAGS = z.custom<Flags>((value) => validator.safeParse(value).success);
const ENVIRONMENT = z.record(z.string(), z.string());
const EXCLUDED_ENV =
  /^(?:ANTHROPIC_|CLAUDE_CODE_(?:OAUTH|USE_|PROCESS_WRAPPER|DISABLE_|SDK_|CONFIG_DIR)|AWS_|GOOGLE_|GOOGLE_APPLICATION_CREDENTIALS$|AZURE_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NODE_OPTIONS$|NODE_PATH$|PATH$|HOME$|XDG_|SMARTEVERYTHING_)/iu;
export function flagSettings(values: Record<string, JsonValue>): Flags {
  for (const key of Object.keys(values)) {
    const reason = SETTINGS_EXCLUSIONS[key];
    if (reason !== undefined) throw new ProviderInputError(`${key}: ${reason}`);
  }
  if (values['env'] !== undefined && values['env'] !== null) {
    for (const key of Object.keys(ENVIRONMENT.parse(values['env'])))
      if (EXCLUDED_ENV.test(key))
        throw new ProviderInputError(
          `env.${key}: ${SETTINGS_EXCLUSIONS['env.authentication'] ?? REASON}`,
        );
  }
  return FLAGS.parse(values);
}
export const SETTINGS_WRITER_SCHEMA = {
  localSettings: z.toJSONSchema(z.strictObject({ outputStyle: z.string().min(1) })),
  userSettings: z.toJSONSchema(
    z.strictObject({ effortLevel: z.enum(['low', 'medium', 'high', 'xhigh']).optional() }),
  ),
};

const INITIAL_SETTINGS = z.custom<Settings>(
  (value) =>
    z.fromJSONSchema(z.record(z.string(), JSON_VALUE).parse(generated)).safeParse(value).success,
);
export function initialSettings(values: Record<string, JsonValue>): Settings {
  flagSettings(values);
  return INITIAL_SETTINGS.parse(
    Object.fromEntries(
      Object.entries(values).filter(
        ([key, value]) => value !== null && !(key === 'effortLevel' && value === 'max'),
      ),
    ),
  );
}
