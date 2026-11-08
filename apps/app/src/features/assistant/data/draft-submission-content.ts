import { z } from 'zod';
import { AI_MESSAGE_REFERENCES, type AiMessageReference } from '@smarteverything/domain';
import { jsonText } from '../../../format/json-text';
import type { HelperTarget } from '../model/helper-target';
import type { Quote } from '../model/composer-state';

export type SubmissionContent = {
  readonly text: string;
  readonly attachments: readonly string[];
  readonly quoteMessageId?: string | undefined;
  readonly quote?: Quote | null;
} & (
  { readonly references: readonly AiMessageReference[] } | { readonly helperTarget: HelperTarget }
);

const CONTENT = z.union([
  z
    .tuple([z.string(), z.array(z.string()), AI_MESSAGE_REFERENCES, z.string().nullable()])
    .transform(([text, attachments, references, quoteMessageId]) => ({
      kind: 'ordinary' as const,
      text,
      attachments,
      references,
      quoteMessageId,
    })),
  z
    .tuple([
      z.string(),
      z.strictObject({ chat_id: z.string() }),
      z.string().nullable(),
      z.array(z.string()),
    ])
    .transform(() => ({ kind: 'helper' as const })),
]);

type Content = z.output<typeof CONTENT>;
type ReadContent =
  | { readonly ok: true; readonly content: Content }
  | { readonly ok: false; readonly reason: string };

function readContent(payload: string): ReadContent {
  const json = jsonText(payload);
  if (!json.ok) return { ok: false, reason: json.reason };
  const parsed = CONTENT.safeParse(json.value);
  return parsed.success
    ? { ok: true, content: parsed.data }
    : { ok: false, reason: parsed.error.message };
}

export const DRAFT_SUBMISSION_PAYLOAD = z.string().superRefine((payload, context) => {
  const read = readContent(payload);
  if (!read.ok) context.addIssue({ code: 'custom', message: read.reason });
});

class DraftSubmissionPayloadError extends Error {
  override readonly name = 'DraftSubmissionPayloadError';
  constructor(readonly reason: string) {
    super('The saved draft submission payload is invalid.');
  }
}

export function decodeDraftSubmission(payload: string): Content {
  const read = readContent(payload);
  if (!read.ok) throw new DraftSubmissionPayloadError(read.reason);
  return read.content;
}

export function encodeDraftSubmission(content: SubmissionContent): string {
  const { text, attachments, quoteMessageId = null } = content;
  return DRAFT_SUBMISSION_PAYLOAD.parse(
    JSON.stringify(
      'helperTarget' in content
        ? [text, content.helperTarget, quoteMessageId, attachments]
        : [text, attachments, content.references, quoteMessageId],
    ),
  );
}
