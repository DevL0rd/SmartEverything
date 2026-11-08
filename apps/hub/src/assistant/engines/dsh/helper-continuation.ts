import { renewHelperWriter as renewWriter } from '../../../harness/helper-writer-renewal';
import { randomUUID } from 'node:crypto';
import {
  HELPER_SETTLEMENT_PROOF,
  HELPER_SETTLEMENT_PROOF_DATA,
} from '@smarteverything/harness/process';
import { isDeepStrictEqual } from 'node:util';
import type { NativeInputHistory } from '@smarteverything/harness';
import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessHost,
  DshSessionMetadata,
  DshWriterClaim,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { sessionAttached } from '../../../harness/attach';
import { assertModelAllowed } from '../../../server/person-scope';
import { assertHelperDelivery } from '../../delegation/helper-dialogue';
import type { HarnessGrant } from '../../../harness/grant';
import type { HarnessService } from '../../../harness/service';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { ChatOwner } from '../../chat-directory';
import { rememberHelperRenewal, retainedHelperSettlement } from './helper-renewal-proof';
import type { HelperSettlement } from './helper-renewal-proof';

export interface Continuation {
  readonly child: DshWriterClaim;
  readonly parent: DshWriterClaim;
}

const UNAVAILABLE =
  'This helper needs its original execution host and an open parent conversation.';

function writerFor(service: HarnessService, chat: AiChatRow): DshWriterClaim {
  if (chat.engine.kind !== 'dsh' || chat.engine.session_id === null)
    throw new ApiError('conflict', UNAVAILABLE);
  const claim = service.store.dshSessions.attached(chat.engine.session_id, chat.profile_id);
  if (
    claim === null ||
    harnessTargetKey(claim.target) !== harnessTargetKey(chat.engine.execution_target)
  )
    throw new ApiError('conflict', UNAVAILABLE);
  return claim;
}

function parentFor(service: HarnessService, chat: AiChatRow): AiChatRow {
  if (chat.kind !== 'subagent' || chat.parent_id === null)
    throw new ApiError('forbidden', 'Only a direct native helper can continue here.');
  const parent = service.store.aiChats.chat(chat.parent_id);
  if (parent.profile_id !== chat.profile_id)
    throw new ApiError('forbidden', 'The helper does not belong to this conversation profile.');
  return parent;
}

interface HelperBinding extends Continuation {
  readonly metadata: DshSessionMetadata;
  readonly host: AiHarnessHost;
  readonly grant: HarnessGrant;
  readonly adoptionEpoch: number;
}

type PendingInput = (history: NativeInputHistory) => readonly string[];
type ClaimRequest = Extract<HarnessRuntimeRequest, { kind: 'open' }>;

function retainedHelper(
  service: HarnessService,
  chat: AiChatRow,
  role: ChatOwner['role'],
  attachments: boolean,
): HelperBinding {
  const child = writerFor(service, chat);
  const parent = writerFor(service, parentFor(service, chat));
  const metadata = service.store.dshSessions.stat(child.session_id, chat.profile_id);
  const host = service.directory.get(child.target).host;
  if (metadata?.header.parentSession !== parent.session_id || metadata.header.origin !== 'subagent')
    throw new ApiError('conflict', UNAVAILABLE);
  if (
    harnessTargetKey(child.target) !== harnessTargetKey(parent.target) ||
    !sessionAttached(service, parent.session_id, chat.profile_id)
  )
    throw new ApiError('conflict', UNAVAILABLE);
  if (host.manifest?.features.includes('subagent-send') !== true)
    throw new ApiError('conflict', 'Update the helper execution host to address it here.');
  const grant = service.storage.grant(child.session_id);
  const adoptionEpoch = retainedAdoptionEpoch(service, child.session_id, grant, role);
  if (attachments) assertAttachmentRoute(service, host, grant);
  return { child, parent, metadata, grant, host, adoptionEpoch };
}

function assertAttachmentRoute(
  service: HarnessService,
  host: AiHarnessHost,
  grant: HarnessGrant,
): void {
  if (host.manifest?.features.includes('subagent-attachments') !== true)
    throw new ApiError('conflict', 'Update the helper execution host to send it attachments.');
  assertModelAllowed(service.store, grant.profile_id, grant.route.model);
  service.routes.selected(grant.profile_id, grant.route, grant.authority.kind === 'trigger');
}

function retainedAdoptionEpoch(
  service: HarnessService,
  sessionId: string,
  grant: HarnessGrant,
  role: ChatOwner['role'],
): number {
  const adoption = service.store.aiAgentRuns.currentOfSession(sessionId);
  if (adoption?.harness === undefined || grant.event_id !== adoption.source_id)
    throw new ApiError('conflict', 'The original helper continuation is no longer available.');
  if (grant.role === 'owner' && role !== 'owner')
    throw new ApiError('forbidden', 'This helper runs with owner access.');
  return adoption.harness.writer_epoch;
}

function current(binding: HelperBinding): boolean {
  return (
    binding.child.runtime_instance === binding.host.runtime_instance &&
    binding.child.connection_generation === binding.host.connection_generation
  );
}

export function helperContinuation(
  service: HarnessService,
  chat: AiChatRow,
  role: ChatOwner['role'],
  attachments = false,
): Continuation {
  const binding = retainedHelper(service, chat, role, attachments);
  if (!current(binding)) throw new ApiError('conflict', UNAVAILABLE);
  return { child: binding.child, parent: binding.parent };
}

function assertColdHelper(
  service: HarnessService,
  binding: HelperBinding,
  pendingInput: PendingInput | undefined,
): HelperSettlement {
  if (binding.host.manifest?.features.includes('subagent-resume') !== true)
    throw new ApiError('conflict', 'Update the helper execution host to resume this helper.');
  if (pendingInput === undefined)
    throw new ApiError('conflict', 'The stored helper inbox cannot be checked here.');
  const { metadata, grant } = binding;
  const events = service.store.dshSessions.readAll(metadata.header.id, metadata.profile_id);
  const boundary = events.findLast(
    (event) =>
      event.seq >= metadata.inherited_event_count &&
      (event.type === 'turn/start' || event.type === 'turn/end'),
  );
  if (
    boundary?.type !== 'turn/end' ||
    service.store.harnessDeliveries.pending(metadata.header.id).length > 0
  )
    throw new ApiError('conflict', 'The helper’s previous turn has no confirmed settlement.');
  const settlement = settlementProof(service, binding);
  if (settlement === undefined)
    throw new ApiError('conflict', 'The helper’s previous activation has no confirmed settlement.');
  if (pendingInput({ metadata, events }).length > 0)
    throw new ApiError('conflict', 'The helper still has unclaimed input on its previous host.');
  service.routes.selected(grant.profile_id, grant.route, grant.authority.kind === 'trigger');
  return settlement;
}

function settlementProof(
  service: HarnessService,
  binding: HelperBinding,
): HelperSettlement | undefined {
  const { child, parent, metadata } = binding;
  const retained = retainedHelperSettlement(service.store, child, parent, metadata.next_seq);
  const expectedEpoch = retained?.writerEpoch ?? child.epoch;
  for (const event of service.store.dshSessions
    .readAll(parent.session_id, metadata.profile_id)
    .toReversed()) {
    if (event.type !== HELPER_SETTLEMENT_PROOF) continue;
    const proof = HELPER_SETTLEMENT_PROOF_DATA.safeParse(event.data);
    if (
      proof.success &&
      proof.data.childSessionId === child.session_id &&
      proof.data.writerEpoch === expectedEpoch &&
      proof.data.nextSeq === metadata.next_seq
    )
      return proof.data;
  }
  return undefined;
}

export function helperContinuationReady(
  service: HarnessService,
  chat: AiChatRow,
  role: ChatOwner['role'],
  options?: { readonly pendingInput: PendingInput; readonly attachments?: boolean },
): string | null {
  try {
    const binding = retainedHelper(service, chat, role, options?.attachments === true);
    if (!current(binding)) assertColdHelper(service, binding, options?.pendingInput);
    return null;
  } catch (cause) {
    return messageOf(cause);
  }
}

export async function prepareDirectedHelper(
  service: HarnessService,
  chat: AiChatRow,
  event: StoredEvent,
  { role, pendingInput }: { readonly role: ChatOwner['role']; readonly pendingInput: PendingInput },
): Promise<{ readonly id: string; readonly helper: Continuation }> {
  const attachments = assertHelperDelivery(service.store, chat, event);
  const helper = await prepareHelperContinuation(service, chat, role, {
    pendingInput,
    attachments: attachments.length > 0,
  });
  return { id: helper.child.session_id, helper };
}

export async function prepareHelperContinuation(
  service: HarnessService,
  chat: AiChatRow,
  role: ChatOwner['role'],
  {
    pendingInput,
    attachments = false,
  }: {
    readonly pendingInput: PendingInput;
    readonly attachments?: boolean;
  },
): Promise<Continuation> {
  const binding = retainedHelper(service, chat, role, attachments);
  const wasCurrent = current(binding);
  const child = wasCurrent
    ? binding.child
    : renewHelperWriter(service, binding, assertColdHelper(service, binding, pendingInput));
  if (
    child.epoch !== binding.adoptionEpoch &&
    !sessionAttached(service, child.session_id, chat.profile_id)
  )
    await sendClaim(service, child, binding);
  const expected = { child, parent: binding.parent };
  assertSameContinuation(helperContinuation(service, chat, role, attachments), expected);
  return expected;
}

function assertSameContinuation(actual: Continuation, expected: Continuation): void {
  if (!isDeepStrictEqual(actual, expected))
    throw new ApiError(
      'conflict',
      'The helper or its parent changed writer while preparing the message.',
    );
}

function renewHelperWriter(
  service: HarnessService,
  binding: HelperBinding,
  settlement: HelperSettlement,
): DshWriterClaim {
  const { store } = service;
  const { child, parent, host, grant } = binding;
  return store.durableWrite(() => {
    store.dshSessions.verifyWriter(parent, service.hostPrincipal(grant.profile_id, host));
    const retained = store.dshSessions.attached(child.session_id, grant.profile_id);
    if (retained?.epoch !== child.epoch)
      throw new ApiError('conflict', 'A different writer already holds this helper.');
    const principal = service.hostPrincipal(grant.profile_id, host);
    const { claim, metadata: renewed } = renewWriter(store, child, principal, grant);
    if (renewed.next_seq !== settlement.nextSeq)
      throw new ApiError('conflict', 'The helper log changed before writer renewal.');
    rememberHelperRenewal(store, { previousEpoch: child.epoch, parent, child: claim, settlement });
    return claim;
  });
}

async function sendClaim(
  service: HarnessService,
  claim: DshWriterClaim,
  binding: HelperBinding,
): Promise<void> {
  const { grant, metadata } = binding;
  const request: ClaimRequest = {
    kind: 'open',
    mode: 'continue',
    continuation_parent: { session_id: binding.parent.session_id, epoch: binding.parent.epoch },
    chat_id: metadata.chat_id,
    claim,
    route: grant.route,
    permission: grant.permission,
    cwd: grant.cwd,
  };
  const receipt = await service.directory.execute(claim.target, randomUUID(), request);
  if (
    receipt.state !== 'ready' ||
    receipt.session_id !== claim.session_id ||
    receipt.epoch !== claim.epoch
  )
    throw new ApiError('conflict', 'The host did not confirm this helper writer.');
}

export async function submitHelperContinuation(
  service: HarnessService,
  chat: AiChatRow,
  event: StoredEvent,
  { role, expected }: { readonly role: ChatOwner['role']; readonly expected: Continuation },
): Promise<void> {
  const attachments = assertHelperDelivery(service.store, chat, event);
  assertSameContinuation(helperContinuation(service, chat, role, attachments.length > 0), expected);
  const { child, parent } = expected;
  const metadata = service.store.dshSessions.stat(child.session_id, event.profile_id);
  if (metadata?.chat_id !== chat.id)
    throw new ApiError('forbidden', 'Helper input cannot reuse another conversation session.');
  service.store.harnessDeliveries.cut(event.id, metadata.next_seq);
  const startSeq = service.store.harnessDeliveries.find(event.id)?.start_seq ?? null;
  if (startSeq === null)
    throw new ApiError('conflict', 'The helper delivery is missing its native history boundary.');
  await service.directory.execute(child.target, event.id, {
    kind: 'prompt',
    author: 'person',
    session_id: child.session_id,
    expected_epoch: child.epoch,
    delivery_id: event.id,
    text: event.text,
    attachments: [...attachments],
    helper_parent: {
      session_id: parent.session_id,
      epoch: parent.epoch,
      start_seq: startSeq,
      quote: event.helper_quote_text ?? null,
    },
  });
}
