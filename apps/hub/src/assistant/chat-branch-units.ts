import {
  helperDialogueOf,
  AI_CHAT_TITLE_MAX,
  ApiError,
  type AiChatRow,
  type AssistantMessageRow,
  type Engine,
} from '@smarteverything/domain';
import { recordNativeFork, type NativeForkPlan } from '../harness/fork-record';
import { summaryOf, type StoredAttachment } from '../store/repositories/assistant-chat';
import type { HostStore } from '../store/host/host-store';
import { durableStoreUnit, storeUnit } from '../store/host/unit';
import type { NewChat } from '../store/repositories/ai-chat-input';
import {
  assertHeldSubagentCreation,
  type HeldChats,
} from '../store/repositories/ai-chat-removal-hold';
import { isHelperDialogueMirror } from './delegation/relay-speaker';

const PENDING_STATES: ReadonlySet<AssistantMessageRow['state']> = new Set([
  'queued',
  'delivered',
  'working',
]);

const BRANCH_PREFIX = 'Branch · ';

function pending(rows: readonly AssistantMessageRow[]): boolean {
  return rows.some((row) => row.role !== 'system' && PENDING_STATES.has(row.state));
}

export interface BranchPathRequest {
  readonly sourceId: string;
  readonly messageId: string;
}

function branchPath(store: HostStore, input: BranchPathRequest): AssistantMessageRow[] {
  const message = store.assistantChat.message(input.messageId);
  if (message.chat_id !== input.sourceId) {
    throw new ApiError('invalid_request', 'That message is not in this chat.');
  }
  if (helperDialogueOf(message) !== undefined)
    throw new ApiError('invalid_request', 'Select a coordinator turn as the branch point.');
  const rows = store.assistantSearch
    .upTo(input.sourceId, input.messageId)
    .filter((row) => !isHelperDialogueMirror(row));
  if (pending(rows)) {
    throw new ApiError(
      'conflict',
      'The AI is still working on this chat; wait for the reply or stop it before branching.',
    );
  }
  return rows;
}

export interface BranchBuild {
  readonly source: AiChatRow;
  readonly title: string | undefined;
  readonly messageId: string;
  readonly engine: Engine;
  readonly path: readonly AssistantMessageRow[];
  readonly copies: readonly (readonly [string, StoredAttachment])[];
  readonly fork: NativeForkPlan | undefined;
  readonly held: HeldChats;
}

interface BranchCopy {
  readonly chatId: string;
  readonly made: ReadonlyMap<string, string>;
  readonly copies: ReadonlyMap<string, StoredAttachment>;
}

function copied(store: HostStore, row: AssistantMessageRow, target: BranchCopy): string {
  const { chatId, made, copies } = target;
  const files = row.attachments.flatMap((file) => copies.get(file.id) ?? []);
  const added = store.assistantChat.addMessage(
    {
      ...row,
      chat_id: chatId,
      reply_to: row.reply_to === null ? null : (made.get(row.reply_to) ?? null),
      quote:
        row.quote === null
          ? null
          : { ...row.quote, message_id: made.get(row.quote.message_id) ?? row.quote.message_id },
      attachments: files.map(summaryOf),
      cost_micros: 0,
      client_message_id: null,
    },
    { createdAt: row.created_at, updatedAt: row.updated_at },
  );
  store.assistantChat.attachTo(
    added.id,
    files.map((file) => file.id),
  );
  return added.id;
}

function builtBranch(store: HostStore, input: BranchBuild): AiChatRow {
  const { source } = input;
  const chat: NewChat = {
    profileId: source.profile_id,
    kind: 'chat',
    title: input.title ?? `${BRANCH_PREFIX}${source.title}`.slice(0, AI_CHAT_TITLE_MAX),
    icon: source.icon,
    parentId: source.id,
    sourceKey: null,
    engine: input.engine,
    ...(source.native_admission === 'standalone' ? { nativeAdmission: 'standalone' } : {}),
    tools: source.tools,
    branchMessageId: input.messageId,
  };
  assertHeldSubagentCreation(input.held, chat);
  const branch = store.aiChats.create(chat);
  if (input.fork !== undefined) recordNativeFork(store, input.fork, branch);
  const copies = new Map(input.copies);
  const made = new Map<string, string>();
  for (const row of input.path) {
    made.set(row.id, copied(store, row, { chatId: branch.id, made, copies }));
  }
  store.aiChats.touched(branch.id, 0);
  return store.aiChats.update(branch.id, { read: true });
}

export const BRANCH_PATH_UNIT = storeUnit(branchPath);
export const BRANCH_BUILD_UNIT = storeUnit((store, input: BranchBuild) =>
  store.write(() => builtBranch(store, input)),
);
export const NATIVE_BRANCH_BUILD_UNIT = durableStoreUnit(builtBranch);
