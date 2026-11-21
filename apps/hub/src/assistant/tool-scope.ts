import { MCP_DISCOVERY_TOOLS, type AiChatRow } from '@smarteverything/domain';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Store } from '../store/store';
import type { HostStore } from '../store/host/host-store';
import { storeUnit } from '../store/host/unit';

export function scopedHub(hub: ToolHub | null, allowed: readonly string[] | null): ToolHub | null {
  if (hub === null || allowed === null) {
    return hub;
  }
  const names = new Set(allowed);
  return hub.restrict((tool) => names.has(tool.name) || MCP_DISCOVERY_TOOLS.has(tool.name));
}

export function effectiveTools(store: HostStore, chat: AiChatRow): readonly string[] | null {
  let allowed: readonly string[] | null = chat.tools;
  let cursor = chat;
  while (cursor.kind === 'subagent' && cursor.parent_id !== null) {
    cursor = store.aiChats.chat(cursor.parent_id);
    if (cursor.tools !== null) {
      const parentTools = cursor.tools;
      allowed =
        allowed === null ? parentTools : allowed.filter((tool) => parentTools.includes(tool));
    }
  }
  return allowed;
}

export const EFFECTIVE_TOOLS_UNIT = storeUnit(
  (store, input: { readonly chat: AiChatRow }): readonly string[] | null =>
    effectiveTools(store, input.chat),
);

export function effectiveToolsOf(
  store: Pick<Store, 'host'>,
  chat: AiChatRow,
): Promise<readonly string[] | null> {
  return store.host.read('assistantEffectiveTools', { chat });
}
