import { z } from 'zod';
import { ApiError, type DshSessionEvent } from '@smarteverything/domain';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import { CALL_TOOL_INPUT } from '../ai-tools/tool-discovery';
import type { HarnessService } from './service';

const READ = z.strictObject({ id: z.uuid() });
const CALL = z.object({
  callId: z.string(),
  name: z.string(),
  arguments: z.string(),
  turn: z.int(),
  step: z.int(),
});
const RESULT = z.object({
  turn: z.int(),
  step: z.int(),
  message: z.object({
    toolCallId: z.string(),
    isError: z.boolean().optional(),
    source: z.object({ kind: z.literal('tool'), callId: z.string() }),
    content: z.array(z.unknown()),
  }),
});
const SUMMARY = z.object({
  result: z.object({ id: z.uuid(), name: z.string(), mime: z.string(), bytes: z.int() }),
});
const TEXT = z.object({ type: z.literal('text'), text: z.string() });

export function explicitNativeOriginal(
  service: HarnessService,
  input: {
    readonly sessionId: string;
    readonly profileId: string;
    readonly event: DshSessionEvent;
    readonly originalId: string | undefined;
  },
): StoredAttachment | undefined {
  if (input.event.type !== 'tool/result' || input.originalId === undefined) return undefined;
  const result = RESULT.parse(input.event.data);
  const call = retainedCall(service, input);
  const id = explicitReadId(call);
  if (id === undefined) return undefined;
  if (id !== input.originalId)
    throw new ApiError('forbidden', 'Native original differs from its retained explicit read.');
  verifyExplicitResult(call, result);
  const file = service.store.assistantChat.attachment(id);
  if (file.profile_id !== input.profileId)
    throw new ApiError('forbidden', 'Native original belongs to another initiating profile.');
  verifyOriginalSummary(file, result);
  return file;
}

function verifyExplicitResult(call: z.infer<typeof CALL>, result: z.infer<typeof RESULT>): void {
  if (
    call.callId !== result.message.toolCallId ||
    call.callId !== result.message.source.callId ||
    call.turn !== result.turn ||
    call.step !== result.step ||
    result.message.isError === true
  )
    throw new ApiError('forbidden', 'Native original differs from its retained explicit read.');
}

function verifyOriginalSummary(file: StoredAttachment, result: z.infer<typeof RESULT>): void {
  const summary = SUMMARY.parse(JSON.parse(TEXT.parse(result.message.content[0]).text)).result;
  if (
    summary.id !== file.id ||
    summary.name !== file.name ||
    summary.mime !== file.mime ||
    summary.bytes !== file.bytes ||
    !file.mime.startsWith('image/')
  )
    throw new ApiError('forbidden', 'Native original differs from its retained tool result.');
}

function retainedCall(
  service: HarnessService,
  input: {
    readonly sessionId: string;
    readonly profileId: string;
    readonly event: DshSessionEvent;
  },
): z.infer<typeof CALL> {
  const [seq] = z.array(z.int().nonnegative()).length(1).parse(input.event.sourceEventSeqs);
  if (seq === undefined || seq >= input.event.seq || input.event.surfaceOp !== 'append')
    throw new ApiError('forbidden', 'Native explicit read has no original call lineage.');
  const call = service.store.dshSessions.read(
    { session_id: input.sessionId, offset: seq, limit: 1 },
    input.profileId,
  ).events[0];
  if (call?.seq !== seq || call.type !== 'tool/call')
    throw new ApiError('forbidden', 'Native explicit read has no retained tool call.');
  return CALL.parse(call.data);
}

function explicitReadId(call: z.infer<typeof CALL>): string | undefined {
  if (call.name === 'read_assistant_attachment') return READ.parse(JSON.parse(call.arguments)).id;
  if (call.name !== 'tool_call') return undefined;
  const forwarded = CALL_TOOL_INPUT.parse(JSON.parse(call.arguments));
  return forwarded.name === 'read_assistant_attachment'
    ? READ.parse(forwarded.arguments).id
    : undefined;
}
