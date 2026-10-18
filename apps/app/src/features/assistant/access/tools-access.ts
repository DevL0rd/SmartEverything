import { router } from 'expo-router';
import { MCP_TOOLS, type AiChatRow } from '@smarteverything/domain';
import { allowedOf, stateOf } from '../details/tools-model';
import type { ToolsAccess } from './access-model';

export function allowedToolCount(chat: Pick<AiChatRow, 'tools'> | undefined): {
  readonly on: number;
  readonly total: number;
} {
  const { on, total } = stateOf(allowedOf({ tools: chat?.tools ?? null }), MCP_TOOLS);
  return { on, total };
}

export function toolsAccess(chat: Pick<AiChatRow, 'tools'>): ToolsAccess {
  const { on, total } = allowedToolCount(chat);
  return {
    label: `Tools for this chat · ${String(on)} of ${String(total)}`,
    onOpen: (): void => {
      router.setParams({ sheet: 'chat', section: 'tools' });
    },
  };
}

export function openMachinePanel(): void {
  router.setParams({ operation: 'model' });
}
