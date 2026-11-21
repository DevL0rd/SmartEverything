import {
  ApiError,
  HELPER_DIALOGUE_KIND,
  type AiChatRow,
  type AssistantHelperPost,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { switchedOffTools } from '../../ai-tools/tool-discovery';
import type { Caller } from '../../server/auth';
import { type Refusal } from '../../server/person-access';
import { effectiveClientById } from '../../server/person-access-units';
import { toolAreaWhy } from '../../server/person-scope-units';
import type { ConversationAuthority } from '../../harness/authority-contract';
import { writerIdentity } from '../../store/repositories/dsh-session-claims';
import type { StoredAttachment } from '../../store/repositories/assistant-files';
import type { HostStore } from '../../store/host/host-store';
import { durableStoreUnit, storeUnit } from '../../store/host/unit';
import { admitChatExecution } from '../native-helpers';
import { admitExecutionTool, executionRole } from '../turn-authority';
import { addResponderMessage } from '../store-units';

const POST_TOOL = 'chat_post';

export interface HelperPair {
  readonly helper: AiChatRow;
  readonly parent: AiChatRow;
  readonly helperName: string;
}

export interface PairCheck {
  readonly caller: Caller;
  readonly chatId: string;
  readonly profile: string;
  readonly authority: ConversationAuthority;
}

export type CheckedPair =
  | { readonly refusal: Refusal }
  | { readonly refusal: null; readonly pair: HelperPair; readonly writer: string | null };

function directPair(store: HostStore, chatId: string, profile: string): HelperPair {
  const helper = store.aiChats.chat(chatId);
  if (
    helper.profile_id !== profile ||
    helper.kind !== 'subagent' ||
    helper.parent_id === null ||
    helper.helper_name === null
  )
    throw new ApiError('forbidden', 'Only a named helper can share with its direct parent.');
  const parent = store.aiChats.chat(helper.parent_id);
  if (parent.profile_id !== profile)
    throw new ApiError('forbidden', 'The helper’s parent belongs to another profile.');
  for (const chat of [helper, parent]) admitChatExecution(chat);
  return { helper, parent, helperName: helper.helper_name };
}

function dshWriterOf(store: HostStore, helper: AiChatRow, eventId: string): string {
  const engine = helper.engine;
  if (engine.kind !== 'dsh' || engine.session_id === null)
    throw new ApiError('forbidden', 'The helper has no admitted SmartEverything session.');
  const grant = store.harnessSessions.grant(engine.session_id);
  const claim = store.dshSessions.attached(engine.session_id, helper.profile_id);
  if (claim === null || grant?.event_id !== eventId)
    throw new ApiError('forbidden', 'The helper’s SmartEverything tool grant is no longer active.');
  return writerIdentity(claim);
}

function validateInitiator(store: HostStore, authority: ConversationAuthority): void {
  if (authority.client_id === null) return;
  const client = effectiveClientById(store, authority.client_id);
  if (
    store.profiles.activeOf(client.id).id !== authority.profile_id ||
    (executionRole(authority) === 'owner' && client.role !== 'owner')
  )
    throw new ApiError('forbidden', 'The initiating app no longer has its original chat access.');
}

function checkedPair(store: HostStore, check: PairCheck): CheckedPair {
  const { authority } = check;
  validateInitiator(store, authority);
  const refusal = toolAreaWhy(store, check.caller, 'assistant');
  if (refusal !== null) return { refusal };
  admitExecutionTool(store, POST_TOOL, authority);
  if (switchedOffTools(store.settings.read().mcp_disabled_tools).has(POST_TOOL))
    throw new ApiError('forbidden', 'The home has turned off chat_post.');
  const pair = directPair(store, check.chatId, check.profile);
  return {
    pair,
    writer:
      pair.helper.engine.kind === 'dsh'
        ? dshWriterOf(store, pair.helper, authority.event_id)
        : null,
    refusal: null,
  };
}

export const HELPER_PAIR_UNIT = storeUnit(
  (store, input: PairCheck & { readonly initial: boolean }): CheckedPair => {
    if (input.initial) {
      const event = store.assistantEvents.event(input.authority.event_id);
      if (
        input.authority.profile_id !== input.profile ||
        event.profile_id !== input.profile ||
        event.chat_id !== input.chatId
      )
        throw new ApiError('forbidden', 'The initiating grant belongs to another conversation.');
    }
    return checkedPair(store, input);
  },
);

type Source = AssistantHelperPost['source'];
type ReceiptKey = Parameters<HostStore['assistantSearch']['helperReceipt']>[0];

function filesInHelper(
  store: HostStore,
  helper: AiChatRow,
  ids: readonly string[],
): StoredAttachment[] {
  if (new Set(ids).size !== ids.length)
    throw new ApiError('invalid_request', 'Select each artifact only once.');
  return ids.map((id) => {
    const file = store.assistantChat.findAttachment(id);
    const messageId = file?.message_id;
    const row =
      messageId === undefined || messageId === null
        ? undefined
        : store.assistantChat.find(messageId);
    if (
      file?.profile_id !== helper.profile_id ||
      row?.chat_id !== helper.id ||
      row.profile_id !== helper.profile_id
    )
      throw new ApiError('not_found', 'The selected attachment is not saved in this helper chat.');
    return file;
  });
}

function imageResults(
  store: HostStore,
  helper: AiChatRow,
  operationId: string,
): StoredAttachment[] {
  const receipt = store.imageOperations.find(operationId)?.receipt;
  if (receipt?.chat_id !== helper.id || receipt.profile_id !== helper.profile_id)
    throw new ApiError('not_found', 'This helper has no image operation with that ID.');
  if (receipt.state !== 'completed' || receipt.message_id === null || receipt.results.length === 0)
    throw new ApiError('conflict', 'That image operation has no completed attachments to share.');
  const files = filesInHelper(
    store,
    helper,
    receipt.results.map((result) => result.attachment.id),
  );
  if (
    files.some((file, index) => {
      const result = receipt.results[index];
      return file.message_id !== receipt.message_id || file.sha256 !== result?.sha256;
    })
  )
    throw new ApiError(
      'conflict',
      'The completed image attachments no longer match their receipt.',
    );
  return files;
}

function savedSources(store: HostStore, helper: AiChatRow, source: Source): StoredAttachment[] {
  switch (source.kind) {
    case 'attachments':
      return filesInHelper(store, helper, source.attachmentIds);
    case 'image_operation':
      return imageResults(store, helper, source.operationId);
  }
}

function receiptOf(
  store: HostStore,
  key: ReceiptKey,
  hash: string,
): AssistantMessageRow | undefined {
  const receipt = store.assistantSearch.helperReceipt(key);
  if (receipt === undefined) return undefined;
  if (receipt.payload_hash !== hash)
    throw new ApiError('conflict', 'This request ID already belongs to another artifact post.');
  const row = store.assistantChat.find(receipt.parent_message_id);
  if (row === undefined)
    throw new ApiError('conflict', 'This artifact post was accepted and has been removed.');
  return row;
}

export const HELPER_ARTIFACT_PREPARE_UNIT = storeUnit(
  (
    store,
    input: {
      readonly helper: AiChatRow;
      readonly source: Source;
      readonly key: ReceiptKey;
      readonly hash: string;
    },
  ): { readonly prior: AssistantMessageRow | null; readonly files: StoredAttachment[] } => {
    const prior = receiptOf(store, input.key, input.hash);
    if (prior !== undefined) return { prior, files: [] };
    return { prior: null, files: savedSources(store, input.helper, input.source) };
  },
);

export const HELPER_ARTIFACT_COMMIT_UNIT = durableStoreUnit(
  (
    store,
    input: {
      readonly check: PairCheck;
      readonly validated: { readonly parentId: string; readonly writer: string | null };
      readonly post: AssistantHelperPost;
      readonly key: ReceiptKey;
      readonly hash: string;
      readonly copies: readonly StoredAttachment[];
    },
  ): AssistantMessageRow => {
    const current = checkedPair(store, input.check);
    if (current.refusal !== null) throw new ApiError('forbidden', current.refusal.message);
    if (
      current.pair.parent.id !== input.validated.parentId ||
      current.writer !== input.validated.writer
    )
      throw new ApiError('conflict', 'The helper’s parent changed while preparing the post.');
    const { helper, parent, helperName } = current.pair;
    const prior = receiptOf(store, input.key, input.hash);
    if (prior !== undefined) return prior;
    savedSources(store, helper, input.post.source);
    const row = addResponderMessage(store, {
      chat: parent,
      replyTo: null,
      text: input.post.text,
      files: input.copies,
      helperDialogue: {
        kind: HELPER_DIALOGUE_KIND,
        direction: 'from_helper',
        helper_chat_id: helper.id,
        helper_name: helperName,
      },
    });
    store.assistantSearch.rememberHelper(input.key, {
      parent_message_id: row.id,
      payload_hash: input.hash,
    });
    return row;
  },
);
