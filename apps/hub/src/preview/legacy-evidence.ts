import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  AI_HTML_PREVIEW_PUBLICATION,
  AI_PREVIEW_HTML_MAX,
  type AiHtmlPreviewPublication,
  type DshSessionEvent,
} from '@smarteverything/domain';
const CALL = z.object({
  callId: z.string(),
  name: z.string(),
  arguments: z.string(),
  turn: z.int(),
  step: z.int(),
});
const ARGUMENTS = z.object({
  chatId: z.uuid(),
  title: z.string(),
  html: z.string().max(AI_PREVIEW_HTML_MAX),
});
const RESULT = z.object({
  turn: z.int(),
  step: z.int(),
  message: z.object({
    toolCallId: z.string(),
    isError: z.boolean().optional(),
    content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
  }),
});
export interface LegacyHtmlRecoveryScope {
  readonly mode: 'latest-canonical-private';
  readonly publication_id?: string | undefined;
}
export interface LegacyHtmlRetention {
  readonly view: AiHtmlPreviewPublication;
  readonly html: string;
  readonly checksum: string;
  readonly sessionId: string;
  readonly callSeq: number;
  readonly resultSeq: number;
  readonly recovery?: LegacyHtmlRecoveryScope;
  readonly revocationEvidence?: 'canonical-only' | 'incomplete';
}
const PUBLICATION_RESULT = z
  .union([
    AI_HTML_PREVIEW_PUBLICATION,
    z.strictObject({ result: AI_HTML_PREVIEW_PUBLICATION }),
    z.strictObject({ result: z.strictObject({ result: AI_HTML_PREVIEW_PUBLICATION }) }),
  ])
  .transform((value) => {
    if ('kind' in value) return value;
    return 'kind' in value.result ? value.result : value.result.result;
  });
export function resultPublication(event: DshSessionEvent):
  | {
      readonly output: AiHtmlPreviewPublication;
      readonly result: z.output<typeof RESULT>;
      readonly links: readonly number[];
    }
  | undefined {
  if (event.type !== 'tool/result') return undefined;
  const result = RESULT.safeParse(event.data);
  const links = z.array(z.int()).safeParse(event.sourceEventSeqs);
  if (!result.success || result.data.message.isError === true || !links.success) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(result.data.message.content.map((block) => block.text).join('\n'));
  } catch (cause) {
    if (cause instanceof SyntaxError) return undefined;
    throw cause;
  }
  const output = PUBLICATION_RESULT.safeParse(raw);
  return output.success
    ? { output: output.data, result: result.data, links: links.data }
    : undefined;
}
function retainedCall(
  native: DshSessionEvent,
  result: z.output<typeof RESULT>,
  view: AiHtmlPreviewPublication,
): z.output<typeof ARGUMENTS> | undefined {
  const call = CALL.parse(native.data);
  if (
    call.name !== 'publish_html' ||
    call.callId !== result.message.toolCallId ||
    call.turn !== result.turn ||
    call.step !== result.step
  )
    return undefined;
  const args = ARGUMENTS.parse(JSON.parse(call.arguments));
  if (args.chatId !== view.chat_id || args.title !== view.title) return undefined;
  return args;
}
export function successfulLegacyHtml(
  events: readonly DshSessionEvent[],
  view: AiHtmlPreviewPublication,
  sessionId: string,
): LegacyHtmlRetention | undefined {
  for (const event of events.toReversed()) {
    const publication = resultPublication(event);
    if (publication?.output.id !== view.id || publication.output.revision !== view.revision)
      continue;
    if (!samePublicationMetadata(publication.output, view)) continue;
    const native = events.find(
      (candidate) =>
        candidate.type === 'tool/call' &&
        candidate.seq < event.seq &&
        publication.links.includes(candidate.seq),
    );
    if (native === undefined) continue;
    const args = retainedCall(native, publication.result, view);
    if (args === undefined) continue;
    return {
      view,
      html: args.html,
      checksum: createHash('sha256').update(args.html).digest('hex'),
      sessionId,
      callSeq: native.seq,
      resultSeq: event.seq,
    };
  }
  return undefined;
}
export function samePublicationMetadata(
  left: AiHtmlPreviewPublication,
  right: AiHtmlPreviewPublication,
): boolean {
  return (
    left.chat_id === right.chat_id &&
    left.profile_id === right.profile_id &&
    left.title === right.title &&
    isDeepStrictEqual(left.file_source, right.file_source) &&
    isDeepStrictEqual(left.project_source, right.project_source)
  );
}
