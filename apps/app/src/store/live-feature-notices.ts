import type { LiveMessage } from '@smarteverything/domain';
import type { LiveSyncHooks } from './live-sync';
import { isRuntimeComputerNotice } from './live-notices';

type FeatureNotice = Exclude<LiveMessage, { type: 'change' | 'subscribed' | 'profile_changed' }>;

export function routeFeatureNotice(
  hooks: LiveSyncHooks,
  message: FeatureNotice,
  live: boolean,
): boolean {
  if (routeTranscriptNotice(hooks, message)) return true;
  if (isProviderNotice(message)) {
    hooks.onAiProviderNotice?.(message);
    return true;
  }
  if (isImageNotice(message)) {
    if (live) hooks.onImageNotice?.(message);
    return true;
  }
  if (routeHarnessNotice(hooks, message)) return true;
  if (isRuntimeComputerNotice(message)) {
    hooks.onComputerNotice?.(message);
    return true;
  }
  return false;
}

function isProviderNotice(
  message: FeatureNotice,
): message is Extract<FeatureNotice, { type: 'ai_chat_provider' | 'ai_chat_runtime_provider' }> {
  return message.type === 'ai_chat_provider' || message.type === 'ai_chat_runtime_provider';
}

function isImageNotice(
  message: FeatureNotice,
): message is Extract<FeatureNotice, { type: 'image_operation' | 'image_operation_preview' }> {
  return message.type === 'image_operation' || message.type === 'image_operation_preview';
}

function routeHarnessNotice(hooks: LiveSyncHooks, message: FeatureNotice): boolean {
  if (message.type === 'ai_preview') {
    hooks.onAiPreviewNotice?.(message);
    return true;
  }
  if (message.type === 'ai_harness_configuration') {
    hooks.onAiHarnessConfigurationNotice?.(message);
    return true;
  }
  if (message.type === 'ai_harness') {
    hooks.onAiHarnessNotice?.(message);
    return true;
  }
  return false;
}

function routeTranscriptNotice(hooks: LiveSyncHooks, message: FeatureNotice): boolean {
  if (message.type !== 'transcript_changed') return false;
  hooks.onTranscriptNotice?.(message);
  return true;
}
