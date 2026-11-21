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
  readonly recall: (who: MemoryPrincipal) => Promise<string>;
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

export async function latestPersonMessage(
  store: Pick<Store, 'host'>,
  chatId: string,
): Promise<LatestMessage | null> {
  const latest = await store.host.call('assistantChat', 'latestPersonText', chatId);
  return latest === undefined ? null : { id: latest.id, text: latest.text };
}

export class VoiceMemoryNotPreparedError extends Error {
  override readonly name = 'VoiceMemoryNotPreparedError';

  constructor(readonly profileId: string) {
    super(`Memory for ${profileId} is read before the call prepared it.`);
  }
}

function preparedKey(who: MemoryPrincipal): string {
  return `${who.profileId}\n${who.chatId ?? ''}`;
}

export function voiceMemory(
  service: MemoryService,
  latest: (chatId: string) => Promise<LatestMessage | null>,
): VoiceMemory {
  const offered = new Map<string, boolean>();
  const offeredTo = (who: MemoryPrincipal): boolean => {
    const found = offered.get(preparedKey(who));
    if (found === undefined) throw new VoiceMemoryNotPreparedError(who.profileId);
    return found;
  };
  return {
    prepare: async (who): Promise<void> => {
      await service.prepare(who, who.chatId === null ? null : await latest(who.chatId));
      offered.set(preparedKey(who), await service.offered(who));
    },
    recall: async (who): Promise<string> => {
      offered.set(preparedKey(who), await service.offered(who));
      return renderRecall(await service.recall(who), new Date());
    },
    source: (who) => ({
      tools: () => (offeredTo(who()) ? [MEMORY_HUB_TOOL] : []),
      call: (_tool, args, caller) => run(service, args, caller),
      validate: (_tool, args): Promise<string | null> => {
        const parsed = AI_MEMORY_TOOL_ARGUMENTS.safeParse(args);
        return Promise.resolve(parsed.success ? null : z.prettifyError(parsed.error));
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
