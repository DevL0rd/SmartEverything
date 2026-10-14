import { z } from 'zod';
import {
  ApiError,
  type AiChatRow,
  type AiChatRuntimeProvider,
  type AiNativeCommandReceipt,
} from '@smarteverything/domain';
import {
  CODEX_COMMAND_REVISION,
  CODEX_COMPACT_DEFINITION,
  CODEX_CAPABILITY_REVISION,
  CODEX_SKILLS_CAPABILITY_REVISION,
} from '../../../codex/provider-commands';
import { codexCommandEvent } from '../../../codex/command-events';
import { CLAUDE_COMMAND_CAPABILITY_REVISION } from '../../../claude/provider/command-catalogue';
import { claudeCommandEvent } from '../../../claude/provider/command-events';
import type { ComputerEvent } from './provider-state';
interface CommandAdapter {
  readonly capabilities: readonly string[];
  readonly revision: (state: AiChatRuntimeProvider) => string;
  readonly compactDefinition: string | null;
  readonly observe: (
    receipt: AiNativeCommandReceipt,
    event: ComputerEvent,
    compact: boolean,
  ) => AiNativeCommandReceipt;
}
export const NATIVE_COMMAND_ADAPTERS: ReadonlyMap<string, CommandAdapter> = new Map([
  [
    'codex',
    {
      capabilities: [CODEX_CAPABILITY_REVISION, CODEX_SKILLS_CAPABILITY_REVISION],
      revision: codexRevision,
      compactDefinition: CODEX_COMPACT_DEFINITION,
      observe: (receipt, event) =>
        'process_generation' in event
          ? codexCommandEvent(receipt, event, receipt.definition_id === CODEX_COMPACT_DEFINITION)
          : receipt,
    },
  ],
  [
    'claude',
    {
      capabilities: [CLAUDE_COMMAND_CAPABILITY_REVISION],
      revision: claudeRevision,
      compactDefinition: null,
      observe: (receipt, event, compact) =>
        'process_generation' in event ? receipt : claudeCommandEvent(receipt, event, compact),
    },
  ],
]);
function codexRevision(state: AiChatRuntimeProvider): string {
  const revision = state.metadata?.initialization['command_catalogue_revision'];
  if (revision === undefined) return CODEX_COMMAND_REVISION;
  return z.string().min(1).max(200).parse(revision);
}
function claudeRevision(state: AiChatRuntimeProvider): string {
  for (const entry of [...state.events].reverse()) {
    const event = entry;
    if (event.kind === 'runtime' && typeof event.payload['_command_revision'] === 'string')
      return event.payload['_command_revision'];
  }
  throw new ApiError(
    'conflict',
    'The owned Claude Query has not published a verified command catalogue.',
  );
}
export function nativeCommandAdapter(chat: AiChatRow): CommandAdapter {
  const adapter = NATIVE_COMMAND_ADAPTERS.get(chat.engine.kind);
  if (adapter === undefined)
    throw new ApiError('conflict', 'No native command adapter is registered.');
  return adapter;
}
