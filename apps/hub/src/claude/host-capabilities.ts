import type { ComputerAiCapabilities, ComputerAiSettings } from '@smarteverything/domain';
import { providerSettings } from './provider/metadata';
import { SDK_VERSION } from './provider/options';

const PROVIDER_OPERATIONS: ComputerAiCapabilities['operations'] = [
  'models',
  'provider_metadata',
  'provider_read',
  'provider_files',
  'provider_control',
  'provider_interrupt',
  'provider_steer',
  'provider_adopt',
  'provider_answer',
  'provider_tool_result',
];

export function claudeCapabilities(
  settings: ComputerAiSettings,
  providerReason: string | null,
): ComputerAiCapabilities {
  const operations: ComputerAiCapabilities['operations'] = [
    'status',
    'configure',
    'native_operation',
  ];
  if (settings.control.enabled) {
    operations.push(
      'native_tools_list',
      'native_tools_call',
      'sessions',
      'session',
      'thread',
      'usage',
      'prompts',
      'install_link',
      'remove_link',
      'answer',
    );
  }
  if (settings.provider.enabled) {
    operations.push(...PROVIDER_OPERATIONS);
    if (providerReason === null) operations.push('provider_start');
  }
  return {
    runtime_version: SDK_VERSION,
    managed_projects: { protocol: 1 },
    operations,
    settings: providerSettings(),
    control_reason: settings.control.enabled
      ? 'Legacy Desktop controls are retired. Use owned Claude CLI chats; direct tools require an attached CLI session.'
      : 'Claude session control is disabled on this computer.',
    provider_reason: settings.provider.enabled
      ? providerReason
      : 'The Claude model provider is disabled on this computer.',
  };
}
