import type { AiChatRow, MessageSource } from '@smarteverything/domain';

export type ChatSourceKind = 'app' | 'plugin' | 'call' | 'camera' | 'schedule' | 'branch';

export interface ChatSource {
  readonly kind: ChatSourceKind;
  readonly pluginId: string | null;
  readonly label: string;
  readonly filterKey: string | null;
}

export const APP_SOURCE: ChatSource = {
  kind: 'app',
  pluginId: null,
  label: 'App',
  filterKey: null,
};

export type PluginNames = ReadonlyMap<string, string>;

const SOURCE_KEY_PLUGIN = /^plugin:([^:]+):/;

function pluginIdOf(chat: AiChatRow): string | null {
  const fromOrigin = chat.origin?.plugin_id ?? null;
  if (fromOrigin !== null) {
    return fromOrigin;
  }
  return SOURCE_KEY_PLUGIN.exec(chat.source_key ?? '')?.[1] ?? null;
}

function pluginSource(chat: AiChatRow, names: PluginNames): ChatSource {
  const pluginId = pluginIdOf(chat);
  const name = pluginId === null ? undefined : names.get(pluginId);
  return {
    kind: 'plugin',
    pluginId,
    label: name ?? chat.origin?.name ?? 'Plugin',
    filterKey: pluginId === null ? 'plugin' : `plugin:${pluginId}`,
  };
}

const FIXED_ORIGINS: Readonly<Partial<Record<MessageSource, ChatSource>>> = {
  voice: { kind: 'call', pluginId: null, label: 'Voice call', filterKey: 'call' },
  schedule: { kind: 'schedule', pluginId: null, label: 'Scheduled', filterKey: 'schedule' },
};

function originSource(chat: AiChatRow, names: PluginNames): ChatSource | null {
  const { origin } = chat;
  if (origin === null) {
    return null;
  }
  if (origin.source === 'plugin') {
    return pluginSource(chat, names);
  }
  if (origin.source === 'wake') {
    return { kind: 'camera', pluginId: null, label: origin.name ?? 'Camera', filterKey: 'camera' };
  }
  return FIXED_ORIGINS[origin.source] ?? null;
}

export function chatSourceOf(chat: AiChatRow, names: PluginNames): ChatSource {
  if (chat.parent_id !== null) {
    const label = chat.kind === 'subagent' ? 'Sub-agent' : 'Branch';
    return { kind: 'branch', pluginId: null, label, filterKey: null };
  }
  if (chat.kind === 'call') {
    return { kind: 'call', pluginId: null, label: 'Voice call', filterKey: 'call' };
  }
  if (chat.kind === 'plugin') {
    return pluginSource(chat, names);
  }
  return originSource(chat, names) ?? APP_SOURCE;
}

export function sameSource(left: ChatSource, right: ChatSource): boolean {
  return (
    left.kind === right.kind &&
    left.pluginId === right.pluginId &&
    left.label === right.label &&
    left.filterKey === right.filterKey
  );
}
