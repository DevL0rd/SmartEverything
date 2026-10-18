import {
  ApiError,
  PROVIDER_FILE_MATCHES,
  type AiChatRow,
  type AiReference,
  type AiReferenceKind,
  type AiReferenceSearch,
  type AiReferenceSummary,
  type ProviderFileMatches,
} from '@smarteverything/domain';
import type { ComputerAiDirectory } from '../computers/ai-directory';
import type { NativeReferences, NativeSearch, ReferenceContext } from './contracts';

type ClaudeChat = AiChatRow & { readonly engine: Extract<AiChatRow['engine'], { kind: 'claude' }> };
type Directory = Pick<ComputerAiDirectory, 'status' | 'request'>;
type DevicePath = Extract<AiReference, { kind: 'device_path' }>;

const NO_FOLDER =
  'Claude mentions files in a folder on the computer. Choose a working directory for this chat or computer first.';
const MENTIONABLE = /^\S+$/u;

export function claudeReferences(directory: Directory): NativeReferences {
  return {
    search: (context, request, kinds) => search(directory, context, request, kinds),
    admit: (context, references): Promise<void> => {
      const chat = claudeChat(context.chat);
      const folder = projectFolder(directory, chat);
      for (const reference of references) assertMentionable(chat, folder, reference);
      return Promise.resolve();
    },
  };
}

async function search(
  directory: Directory,
  context: ReferenceContext,
  request: AiReferenceSearch,
  kinds: readonly AiReferenceKind[],
): Promise<NativeSearch> {
  const chat = claudeChat(context.chat);
  const folder = projectFolder(directory, chat);
  const device = kinds.includes('device_path');
  if (!device || folder === undefined || request.container !== undefined)
    return {
      sources: kinds.map((kind) => ({
        kind,
        state: 'unavailable',
        reason: folder === undefined ? NO_FOLDER : 'Claude cannot mention this kind of item.',
      })),
      matches: { items: [], incomplete: false },
    };
  const found = await directory.request(
    chat.engine.device_id,
    { operation: 'provider_files', cwd: folder, query: request.query, limit: request.limit },
    PROVIDER_FILE_MATCHES,
  );
  return {
    sources: kinds.map((kind) => ({ kind, state: 'available' })),
    matches: { items: summaries(chat, folder, found), incomplete: found.incomplete },
  };
}

function summaries(
  chat: ClaudeChat,
  folder: string,
  found: ProviderFileMatches,
): AiReferenceSummary[] {
  return found.entries
    .filter((entry) => MENTIONABLE.test(entry.path))
    .map((entry) => ({
      reference: {
        kind: 'device_path',
        target: { kind: 'device', device_id: chat.engine.device_id },
        workspace_root: folder,
        path: entry.path,
        entry_kind: entry.entry_kind,
        version: entry.version,
      },
      label: entry.path,
      subtitle: folder,
    }));
}

function claudeChat(chat: AiChatRow): ClaudeChat {
  if (chat.engine.kind !== 'claude')
    throw new ApiError('conflict', 'Claude mentions belong to Claude chats.');
  return { ...chat, engine: chat.engine };
}

function projectFolder(directory: Directory, chat: ClaudeChat): string | undefined {
  const settings = directory.status(chat.engine.device_id).settings.provider.options;
  return { ...settings, ...chat.engine.settings }.cwd;
}

function assertMentionable(
  chat: ClaudeChat,
  folder: string | undefined,
  reference: AiReference,
): asserts reference is DevicePath {
  if (
    reference.kind !== 'device_path' ||
    reference.target.device_id !== chat.engine.device_id ||
    reference.workspace_root !== folder
  )
    throw new ApiError(
      'conflict',
      'Claude can only mention files in the folder this chat works in.',
    );
}
