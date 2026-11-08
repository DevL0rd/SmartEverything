import { createHash } from 'node:crypto';
import {
  ApiError,
  HELPER_DIALOGUE_KIND,
  type AiChatRow,
  type AssistantHelperPost,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import type { Caller } from '../../server/auth';
import type { StoredAttachment } from '../../store/repositories/assistant-files';
import type { Store } from '../../store/store';
import { ConversationLog } from '../conversation-log';
import type { AssistantFiles } from '../files';
import { helperArtifactScope, type HelperArtifactScope } from './helper-artifact-scope';
import { receiptKey } from './helper-receipt';

interface Ports {
  readonly store: Store;
  readonly files: AssistantFiles;
}

type ReceiptKey = Parameters<Store['assistantSearch']['helperReceipt']>[0];
type Source = AssistantHelperPost['source'];

function filesInHelper(
  store: Store,
  helper: AiChatRow,
  ids: readonly string[],
): StoredAttachment[] {
  requireDistinct(ids);
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

function requireDistinct(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length)
    throw new ApiError('invalid_request', 'Select each artifact only once.');
}

function imageResults(store: Store, helper: AiChatRow, operationId: string): StoredAttachment[] {
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

function savedSources(store: Store, helper: AiChatRow, source: Source): StoredAttachment[] {
  switch (source.kind) {
    case 'attachments':
      return filesInHelper(store, helper, source.attachmentIds);
    case 'image_operation':
      return imageResults(store, helper, source.operationId);
  }
}

function receiptOf(store: Store, key: ReceiptKey, hash: string): AssistantMessageRow | undefined {
  const receipt = store.assistantSearch.helperReceipt(key);
  if (receipt === undefined) return undefined;
  if (receipt.payload_hash !== hash)
    throw new ApiError('conflict', 'This request ID already belongs to another artifact post.');
  const row = store.assistantChat.find(receipt.parent_message_id);
  if (row === undefined)
    throw new ApiError('conflict', 'This artifact post was accepted and has been removed.');
  return row;
}

function commit(
  store: Store,
  scope: HelperArtifactScope,
  input: AssistantHelperPost,
  prepared: {
    readonly key: ReceiptKey;
    readonly hash: string;
    readonly copies: readonly StoredAttachment[];
  },
): AssistantMessageRow {
  return store.durableWrite(() => {
    const { helper, parent, helperName } = scope.validate();
    const prior = receiptOf(store, prepared.key, prepared.hash);
    if (prior !== undefined) return prior;
    savedSources(store, helper, input.source);
    const row = new ConversationLog(store).responderInChat({
      chat: parent,
      replyTo: null,
      text: input.text,
      files: prepared.copies,
      helperDialogue: {
        kind: HELPER_DIALOGUE_KIND,
        direction: 'from_helper',
        helper_chat_id: helper.id,
        helper_name: helperName,
      },
    });
    store.assistantSearch.rememberHelper(prepared.key, {
      parent_message_id: row.id,
      payload_hash: prepared.hash,
    });
    return row;
  });
}

export async function postHelperArtifacts(
  ports: Ports,
  caller: Caller,
  input: AssistantHelperPost,
): Promise<AssistantMessageRow> {
  const { store, files } = ports;
  const scope = helperArtifactScope(store, caller);
  const { parent, helper } = scope.pair;
  const key = receiptKey(parent, `artifact-post:${helper.id}:${input.requestId}`);
  const hash = createHash('sha256')
    .update(JSON.stringify([input.source, input.text]))
    .digest('hex');
  const prior = receiptOf(store, key, hash);
  if (prior !== undefined) return prior;
  const copies: StoredAttachment[] = [];
  try {
    for (const file of savedSources(store, helper, input.source))
      copies.push(await files.prepareCopy(file));
    return commit(store, scope, input, { key, hash, copies });
  } finally {
    await files.discardCopies(copies);
  }
}
