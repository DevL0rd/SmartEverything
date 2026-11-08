import { AI_MEMORY_TOOL_ARGUMENTS } from '@smarteverything/domain';
import {
  MEMORY_DESCRIPTION,
  MEMORY_PARAMETERS,
  MEMORY_TOOL,
  renderRecall,
} from '@smarteverything/harness/process';
import { z } from 'zod';
import type { HubTool, HubToolResult, ToolCaller, ToolSource } from '../ai-tools/hub-tool';
import type { MemoryPrincipal } from '../memory/principal';
import type { LatestMessage, MemoryService } from '../memory/service';
import { hubMemoryOf } from '../memory/hub-memory';
import type { ServerContext } from '../server/context';
import type { Store } from '../store/store';
import { runMemoryTool } from '../memory/tool';

export const MEMORY_HUB_TOOL: HubTool = {
  name: MEMORY_TOOL,
  title: 'Memory',
  description: MEMORY_DESCRIPTION,
  inputSchema: MEMORY_PARAMETERS,
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  origin: { kind: 'core' },
  humanOnly: false,
};

export interface VoiceMemory {
  readonly prepare: (who: MemoryPrincipal) => Promise<void>;
  readonly recall: (who: MemoryPrincipal) => string;
  readonly source: (who: () => MemoryPrincipal) => ToolSource;
}

export function callPrincipal(
  caller: Pick<ToolCaller, 'profileId' | 'role' | 'chatId'>,
): MemoryPrincipal {
  return {
    profileId: caller.profileId,
    role: caller.role,
    chatId: caller.chatId,
    messageId: null,
  };
}

async function run(
  service: MemoryService,
  args: Readonly<Record<string, unknown>>,
  caller: ToolCaller,
): Promise<HubToolResult> {
  const response = await runMemoryTool(
    service,
    callPrincipal(caller),
    AI_MEMORY_TOOL_ARGUMENTS.parse(args),
  );
  return { response, line: '', pictures: [] };
}

export function latestPersonMessage(
  store: Pick<Store, 'assistantChat'>,
  chatId: string,
): LatestMessage | null {
  const latest = store.assistantChat.latestPersonText(chatId);
  return latest === undefined ? null : { id: latest.id, text: latest.text };
}

export function voiceMemory(
  service: MemoryService,
  latest: (chatId: string) => LatestMessage | null,
): VoiceMemory {
  return {
    prepare: (who) => service.prepare(who, who.chatId === null ? null : latest(who.chatId)),
    recall: (who) => renderRecall(service.recall(who), new Date()),
    source: (who) => ({
      tools: () => (service.offered(who()) ? [MEMORY_HUB_TOOL] : []),
      call: (_tool, args, caller) => run(service, args, caller),
      validate: (_tool, args): string | null => {
        const parsed = AI_MEMORY_TOOL_ARGUMENTS.safeParse(args);
        return parsed.success ? null : z.prettifyError(parsed.error);
      },
      changes: () => () => undefined,
    }),
  };
}

export function hubVoiceMemory(context: Pick<ServerContext, 'store' | 'openRouter'>): VoiceMemory {
  return voiceMemory(hubMemoryOf(context).service, (chatId) =>
    latestPersonMessage(context.store, chatId),
  );
}
