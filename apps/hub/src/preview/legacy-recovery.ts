import { z } from 'zod';
import { ApiError, type DshSessionEvent } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import { projectCallerAuthority } from '../projects/authority';
import { legacyHtmlSessions, type LegacyHtmlSession } from './legacy-sessions';
import {
  resultPublication,
  successfulLegacyHtml,
  type LegacyHtmlRetention,
  type LegacyHtmlRecoveryScope,
} from './legacy-evidence';
const SCOPE = z.strictObject({
  mode: z.literal('latest-canonical-private'),
  publication_id: z.uuid().optional(),
});
const CALL = z.object({
  name: z.string(),
  callId: z.string(),
  arguments: z.string(),
  turn: z.int(),
  step: z.int(),
});
const TARGET = z.object({ chatId: z.uuid(), publicationId: z.uuid() });
const OPERATION = z.object({ operation: z.literal('revokeAiPreview'), arguments: TARGET });
const RESULT = z.object({
  turn: z.int(),
  step: z.int(),
  message: z.object({
    toolCallId: z.string(),
    isError: z.boolean().optional(),
    content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
  }),
});
const DONE = z.strictObject({ ok: z.literal(true) });
const SUCCESS = z.union([
  DONE,
  z.strictObject({ result: DONE }),
  z.strictObject({ result: z.strictObject({ result: DONE }) }),
]);
interface Candidate {
  readonly record: LegacyHtmlRetention;
  readonly time: number;
}
function candidates(
  session: LegacyHtmlSession,
  owner: { readonly chat: string; readonly profile: string },
): readonly Candidate[] {
  const found: Candidate[] = [];
  for (const event of session.events) {
    const publication = resultPublication(event);
    if (publication === undefined) continue;
    const view = publication.output;
    if (
      view.chat_id !== owner.chat ||
      view.profile_id !== owner.profile ||
      view.file_source !== undefined ||
      view.project_source !== undefined
    )
      continue;
    const record = successfulLegacyHtml(session.events, view, session.id);
    if (record?.resultSeq === event.seq) found.push({ record, time: event.time });
  }
  return found;
}
function revokeTarget(
  event: DshSessionEvent,
): { readonly target: z.output<typeof TARGET>; readonly call: z.output<typeof CALL> } | undefined {
  if (event.type !== 'tool/call') return undefined;
  const call = CALL.safeParse(event.data);
  if (!call.success || !['revoke_shared_preview', 'call_operation'].includes(call.data.name))
    return undefined;
  const raw: unknown = JSON.parse(call.data.arguments);
  if (call.data.name === 'revoke_shared_preview')
    return { target: TARGET.parse(raw), call: call.data };
  const operation = OPERATION.safeParse(raw);
  return operation.success ? { target: operation.data.arguments, call: call.data } : undefined;
}
interface RevokeOutcome {
  readonly state: 'revoked' | 'failed' | 'unresolved';
  readonly time: number;
  readonly seq: number;
}
function revokeMatches(
  event: DshSessionEvent,
  native: DshSessionEvent,
  call: z.output<typeof CALL>,
): z.output<typeof RESULT> | undefined {
  if (event.type !== 'tool/result' || event.seq <= native.seq) return undefined;
  const result = RESULT.safeParse(event.data);
  const links = z.array(z.int()).safeParse(event.sourceEventSeqs);
  if (!result.success || !links.success || !links.data.includes(native.seq)) return undefined;
  const data = result.data;
  if (data.message.toolCallId !== call.callId || data.turn !== call.turn || data.step !== call.step)
    return undefined;
  return data;
}
function revokeResult(
  session: LegacyHtmlSession,
  native: DshSessionEvent,
  call: z.output<typeof CALL>,
): RevokeOutcome {
  for (const event of session.events) {
    const data = revokeMatches(event, native, call);
    if (data === undefined) continue;
    if (data.message.isError === true) return { state: 'failed', time: event.time, seq: event.seq };
    let raw: unknown;
    try {
      raw = JSON.parse(data.message.content.map((block) => block.text).join('\n'));
    } catch (cause) {
      if (cause instanceof SyntaxError)
        return { state: 'unresolved', time: event.time, seq: event.seq };
      throw cause;
    }
    return {
      state: SUCCESS.safeParse(raw).success ? 'revoked' : 'unresolved',
      time: event.time,
      seq: event.seq,
    };
  }
  return { state: 'unresolved', time: native.time, seq: native.seq };
}
function revocationState(
  sessions: readonly LegacyHtmlSession[],
  candidate: Candidate,
): 'revoked' | 'canonical-only' | 'incomplete' {
  let state: 'canonical-only' | 'incomplete' = 'canonical-only';
  for (const session of sessions)
    for (const event of session.events) {
      const revoke = revokeTarget(event);
      if (
        revoke?.target.chatId !== candidate.record.view.chat_id ||
        revoke.target.publicationId !== candidate.record.view.id
      )
        continue;
      const outcome = revokeResult(session, event, revoke.call);
      const later =
        session.id === candidate.record.sessionId
          ? outcome.seq > candidate.record.resultSeq
          : outcome.time >= candidate.time;
      if (!later) continue;
      if (outcome.state === 'revoked') return 'revoked';
      if (outcome.state === 'unresolved') state = 'incomplete';
    }
  return state;
}
function latestCandidate(
  all: readonly Candidate[],
  publication: string | undefined,
): Candidate | undefined {
  const ordered = all
    .filter((candidate) => publication === undefined || candidate.record.view.id === publication)
    .toSorted(
      (left, right) =>
        right.time - left.time ||
        (left.record.sessionId === right.record.sessionId
          ? right.record.resultSeq - left.record.resultSeq
          : 0),
    );
  const latest = ordered[0];
  const next = ordered[1];
  if (
    latest !== undefined &&
    latest.time === next?.time &&
    latest.record.sessionId !== next.record.sessionId
  )
    throw new ApiError(
      'conflict',
      'The latest canonical HTML is ambiguous across sessions; select its exact publication.',
    );
  return latest;
}
export function recoverLatestLegacyHtml(
  store: Store,
  caller: Caller,
  chat: string,
  input: LegacyHtmlRecoveryScope,
): readonly LegacyHtmlRetention[] {
  const scope = SCOPE.parse(input);
  const authority = projectCallerAuthority(store, caller, chat);
  const sessions = legacyHtmlSessions(store, chat, authority.profileId);
  const candidate = latestCandidate(
    sessions.flatMap((session) => candidates(session, { chat, profile: authority.profileId })),
    scope.publication_id,
  );
  if (candidate === undefined) return [];
  const revoked = revocationState(sessions, candidate);
  authority.validate(false);
  if (revoked === 'revoked') return [];
  return [{ ...candidate.record, recovery: scope, revocationEvidence: revoked }];
}

export function canonicalRevocationEvidence(
  store: Store,
  record: LegacyHtmlRetention,
): 'revoked' | 'canonical-only' | 'incomplete' {
  const sessions = legacyHtmlSessions(store, record.view.chat_id, record.view.profile_id);
  const event = sessions
    .find((session) => session.id === record.sessionId)
    ?.events.find((value) => value.seq === record.resultSeq);
  if (event === undefined)
    throw new ApiError('conflict', 'The retained canonical result disappeared.');
  return revocationState(sessions, { record, time: event.time });
}
