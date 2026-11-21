import {
  ApiError,
  type AiChatRow,
  type AssistantMessageRow,
  type AssistantNewMessage,
  type ClientRow,
} from '@smarteverything/domain';
import type { StoredAttachment } from '../../store/repositories/assistant-chat';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import type { AssistantFiles } from '../files';
import type { EngineRegistry } from '../engines/registry';
import { helperReplyWasRelayed } from '../engines/dsh/helper-reply';
import type { Sender } from '../requests';
import { authorityScope, executionDeviceOf } from '../turn-authority';
import { helperParentMessageId } from './helper-delivery';
import type {
  Delivery,
  DialogueQueued,
  DialogueRequest,
  DirectedMessage,
} from './helper-dialogue-units';

interface DialoguePorts {
  readonly store: Store;
  readonly engines: EngineRegistry;
  readonly files: AssistantFiles;
  readonly added: () => void;
  readonly queueRun: (parent: AiChatRow, target: AiChatRow) => Promise<void>;
  readonly now: () => Date;
}

export async function sendHelperDialogue(
  ports: DialoguePorts,
  sender: Sender,
  parent: AiChatRow,
  body: AssistantNewMessage,
): Promise<AssistantMessageRow> {
  const message = directedMessage(body);
  const { store, files } = ports;
  const request = {
    sender: { clientId: sender.clientId, profileId: sender.profileId },
    parentId: parent.id,
    message,
    held: store.live.chatWork.holds.held(),
  };
  const first = await store.host.read('helperDialoguePrepare', request);
  if (first.kind === 'sent') return first.row;
  const prepared = first.delivery;
  await assertHelperReady(
    ports.engines,
    prepared.target,
    prepared.client.role,
    message.uploadIds.length > 0,
  );
  const copies: StoredAttachment[] = [];
  let accepted = false;
  try {
    if (prepared.originals.length > 0) {
      await preflight(ports, sender, prepared);
      for (const file of prepared.originals) copies.push(await files.prepareCopy(file));
      await assertHelperReady(ports.engines, prepared.target, prepared.client.role, true);
    }
    await ports.queueRun(prepared.parent, prepared.target);
    const row = await queueDialogue(ports, request, prepared, copies);
    accepted = row.added;
    if (accepted) ports.added();
    return row.row;
  } finally {
    if (!accepted && copies.length > 0) await files.discardCopies(copies);
  }
}

function queueDialogue(
  ports: DialoguePorts,
  request: Omit<DialogueRequest, 'held'>,
  prepared: Delivery,
  copies: readonly StoredAttachment[],
): Promise<DialogueQueued> {
  const { store } = ports;
  const engine = ports.engines.engineOf(prepared.target);
  const device = executionDeviceOf(prepared.target);
  return store.host.write('helperDialogueQueue', {
    ...request,
    held: store.live.chatWork.holds.held(),
    prepared,
    copies: copies.map((file) => file.id),
    scope: authorityScope(),
    localTarget: device !== null && store.live.computers.isLocal(device),
    ownerOnly: engine?.ownerOnly === true,
    now: ports.now().toISOString(),
  });
}

function preflight(ports: DialoguePorts, sender: Sender, delivery: Delivery): Promise<void> {
  const engine = ports.engines.engineOf(delivery.target);
  const prepare = engine?.preflightHelperInput;
  if (prepare === undefined && engine?.helperReady !== undefined) return Promise.resolve();
  if (prepare === undefined)
    throw new ApiError('conflict', 'This helper cannot accept attachments from the parent chat.');
  return prepare({
    target: delivery.target,
    clientId: sender.clientId,
    files: delivery.originals,
    text: delivery.message.text,
    quote: delivery.quoted?.text ?? null,
  });
}

async function assertHelperReady(
  engines: EngineRegistry,
  target: AiChatRow,
  role: ClientRow['role'],
  attachments: boolean,
): Promise<void> {
  const engine = engines.forMutation(target, role);
  if (target.engine.kind === 'dsh' && engine?.helperReady === undefined)
    throw new ApiError(
      'conflict',
      'This helper cannot receive a separate turn from the parent chat yet.',
    );
  const reason = await engine?.helperReady?.(target, role, attachments);
  if (reason !== undefined && reason !== null) throw new ApiError('conflict', reason);
  const unavailable = engines.ready(target);
  if (unavailable !== null) throw new ApiError('conflict', unavailable);
}

function directedMessage(body: AssistantNewMessage): DirectedMessage {
  if (body.helper_target === undefined || body.client_message_id === undefined)
    throw new ApiError('invalid_request', 'Choose a helper and provide a client message ID.');
  if (body.text === '' && body.attachments.length === 0)
    throw new ApiError('invalid_request', 'Send some text or at least one attachment.');
  if ((body.references?.length ?? 0) > 0)
    throw new ApiError(
      'invalid_request',
      'This helper message does not support structured references.',
    );
  return {
    text: body.text,
    uploadIds: body.attachments,
    targetId: body.helper_target.chat_id,
    quoteId: body.quote_message_id ?? null,
    clientMessageId: body.client_message_id,
  };
}

export async function reconcileHelperDialogue(
  store: Store,
  finish: (event: StoredEvent, text: string, ok: boolean) => Promise<void>,
): Promise<void> {
  const reconciled = await store.host.write('helperDialogueReconcile', null);
  for (const { event, text, ok } of reconciled) await finish(event, text, ok);
}

export function settleHelperDialogue(
  ports: Pick<DialoguePorts, 'store'>,
  event: StoredEvent,
  text: string,
  ok: boolean,
): Promise<void> | null {
  const id = helperParentMessageId(event);
  if (id === null) return null;
  return recordHelperSettlement(ports.store, { id, event, text, ok });
}

async function recordHelperSettlement(
  store: Store,
  settled: {
    readonly id: string;
    readonly event: StoredEvent;
    readonly text: string;
    readonly ok: boolean;
  },
): Promise<void> {
  const { id, event, text, ok } = settled;
  const row = await store.host.call('assistantChat', 'find', id);
  const relayed =
    ok &&
    row !== undefined &&
    text.trim() !== '' &&
    (await helperReplyWasRelayed(store, event, row.chat_id));
  await store.host.write('helperDialogueSettle', {
    parentMessageId: id,
    eventId: event.id,
    text,
    ok,
    relayed,
  });
}
