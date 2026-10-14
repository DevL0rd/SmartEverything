import type { AiChatRuntimeProvider, ComputerAiRuntime } from '@smarteverything/domain';
import { z } from 'zod';
import type { CommandDescriptor } from './types';
import { codexProviderKey } from '../../../queries/codex-provider-events';
import { providerKey } from '../../../queries/keys';
interface NativeRuntimeAdapter {
  readonly revisions: readonly string[];
  readonly key: (chatId: string) => readonly string[];
  readonly compact: (command: CommandDescriptor) => boolean;
}
const nativeRuntimes: Readonly<Record<ComputerAiRuntime, NativeRuntimeAdapter>> = {
  codex: {
    revisions: ['codex-app-server-0.162.1-r2', 'codex-app-server-0.162.1-skills-r3'],
    key: codexProviderKey,
    compact: (command): boolean => command.id === 'codex:rpc:thread/compact/start',
  },
  claude: {
    revisions: ['claude-sdk-0.3.296-commands-r2'],
    key: (chatId): readonly string[] => [...providerKey(chatId), 'state'],
    compact: (command): boolean =>
      command.native?.builtin === true && command.native.native_name === 'compact',
  },
};
export function nativeRuntimeAdapter(runtime: ComputerAiRuntime): NativeRuntimeAdapter {
  return nativeRuntimes[runtime];
}
export function nativeCatalogueRevision(state: AiChatRuntimeProvider | undefined): string | null {
  if (state === undefined) return null;
  if (state.runtime === 'codex') {
    const revision = state.metadata?.initialization['command_catalogue_revision'];
    return revision === undefined ? null : z.string().min(1).max(200).parse(revision);
  }
  for (const event of [...state.events].reverse())
    if (event.kind === 'runtime' && event.payload['_command_revision'] !== undefined)
      return z.string().min(1).max(200).parse(event.payload['_command_revision']);
  return null;
}
