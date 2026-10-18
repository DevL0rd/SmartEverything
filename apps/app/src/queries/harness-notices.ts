import type { QueryClient } from '@tanstack/react-query';
import {
  EXTENSIONS_KEY,
  EXTENSION_CONFIGURATION_KEY,
  DISCOVERY_KEY,
  SKILL_UPDATES_KEY,
} from './extension-keys';
import { AGENT_RUN_PREFIX, AI_MODELS_PREFIX } from './keys';
import { noticeHandler, type NoticeHandler } from '../store/notice-registry';
import { background } from '@smarteverything/logging';

const REFERENCE_QUERY_PREFIX = ['window', 'ai-references'] as const;

const COMMAND_QUERY_PREFIX = ['window', 'ai-harness-commands'] as const;

const PROVIDER_QUERY_PREFIX = ['window', 'ai-provider'] as const;

export const HARNESS_CATALOGUE_KEY = ['window', 'ai-harness'] as const;
const HARNESS_SESSION_PREFIX = ['window', 'ai-harness-session'] as const;

const CONFIGURATION_KEYS: readonly (readonly string[])[] = [
  EXTENSION_CONFIGURATION_KEY,
  EXTENSIONS_KEY,
  SKILL_UPDATES_KEY,
  DISCOVERY_KEY,
  COMMAND_QUERY_PREFIX,
  REFERENCE_QUERY_PREFIX,
  HARNESS_CATALOGUE_KEY,
  AI_MODELS_PREFIX,
];

const STOPPED_KEYS: readonly (readonly string[])[] = [
  EXTENSION_CONFIGURATION_KEY,
  EXTENSIONS_KEY,
  SKILL_UPDATES_KEY,
  DISCOVERY_KEY,
  HARNESS_CATALOGUE_KEY,
  HARNESS_SESSION_PREFIX,
  COMMAND_QUERY_PREFIX,
  REFERENCE_QUERY_PREFIX,
];

export function harnessKey(chatId: string): readonly string[] {
  return [...HARNESS_SESSION_PREFIX, chatId];
}

function invalidate(client: QueryClient, keys: readonly (readonly string[])[]): void {
  for (const queryKey of keys)
    background(client.invalidateQueries({ queryKey }), 'queries.invalidate_failed');
}

function refreshHarnessConfiguration(client: QueryClient): void {
  invalidate(client, CONFIGURATION_KEYS);
}

export function refreshHarness(client: QueryClient): void {
  refreshHarnessConfiguration(client);
  invalidate(client, [HARNESS_SESSION_PREFIX, PROVIDER_QUERY_PREFIX]);
}

export function cancelHarnessQueries(client: QueryClient): void {
  for (const queryKey of STOPPED_KEYS)
    background(client.cancelQueries({ queryKey }), 'queries.cancel_failed');
}

export const HARNESS_NOTICES: readonly NoticeHandler[] = [
  noticeHandler(['ai_harness_configuration'], (_message, { client }) => {
    refreshHarnessConfiguration(client);
  }),
  noticeHandler(['ai_harness'], ({ event }, { client }) => {
    if (event.kind === 'text' || event.kind === 'reasoning' || event.kind === 'tool') return;
    invalidate(client, [harnessKey(event.chat_id), COMMAND_QUERY_PREFIX, REFERENCE_QUERY_PREFIX]);
    if (event.kind === 'usage' || event.kind === 'state' || event.kind === 'failed')
      invalidate(client, [HARNESS_CATALOGUE_KEY]);
    if (event.kind === 'agent') invalidate(client, [[...AGENT_RUN_PREFIX, event.chat_id]]);
  }),
];
