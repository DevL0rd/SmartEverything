import { CODEX_PROVIDER_METADATA } from '@smarteverything/domain';
import type { RpcRecord } from './protocol';
import { subscriptionBillingBlock } from './rate-limits';
export function providerMetadata(
  rateLimits: RpcRecord | null,
  catalogueRevision: string,
): ReturnType<typeof CODEX_PROVIDER_METADATA.parse> {
  const billing = subscriptionBillingBlock(rateLimits);
  return CODEX_PROVIDER_METADATA.parse({
    runtime_version: '0.162.1',
    commands: [],
    agents: [],
    settings: [],
    operations: [
      'context',
      'usage',
      'tasks',
      'sessions',
      'session_messages',
      'mcp_status',
      'file',
      'close',
      'rename_session',
      'fork_session',
      'archive_session',
      'unarchive_session',
      'delete_session',
    ],
    unavailable_operations: {
      audio: 'Audio input is not verified for this managed authentication route.',
      document: 'The app-server has no generic PDF input.',
      set_model: 'Persist engine model and effort for the next turn.',
      set_options: 'Persist engine options for the next turn.',
      native_agent_control: 'Native child control is not implemented.',
    },
    initialization: {
      runtime: 'codex',
      command_catalogue_revision: catalogueRevision,
      authentication: 'chatgpt',
      subscription: 'eligible',
      billing_guard: billing === null ? { state: 'eligible' } : { state: 'blocked', ...billing },
      rate_limits: rateLimits,
    },
  });
}
