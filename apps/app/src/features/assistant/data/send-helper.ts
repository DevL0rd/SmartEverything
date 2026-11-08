import { sendAiChatMessage } from '../../../api/ai';
import { notify } from '../../../components/toast-store';
import type { HelperMention, HelperTarget } from '../model/helper-target';
import { withoutHelperMentions } from '../model/helper-target';
import type { Quote } from '../model/composer-state';
import { captureDraftSubmission, clearSubmittedDraft, draftRevision, draftText } from './drafts';
import { clearSubmittedUploads } from './uploads';

interface HelperSubmission {
  readonly key: string;
  readonly target: HelperTarget;
  readonly mentions: readonly HelperMention[];
  readonly quote: Quote | null;
  readonly attachments: readonly string[];
  readonly uploadKeys: readonly string[];
}

export async function sendHelper(input: HelperSubmission): Promise<boolean> {
  const { key, target, mentions, quote, attachments, uploadKeys } = input;
  const revision = draftRevision(key);
  const text = withoutHelperMentions(draftText(key), mentions);
  if (text === '' && attachments.length === 0) return false;
  const quoteMessageId = quote?.messageId;
  const submission = captureDraftSubmission(key, {
    text,
    attachments,
    helperTarget: target,
    quoteMessageId,
  });
  try {
    await sendAiChatMessage(key, text, attachments, {
      clientMessageId: submission.id,
      helperTarget: target,
      ...(quoteMessageId === undefined ? {} : { quoteMessageId }),
    });
  } catch (error) {
    notify({
      message: error instanceof Error ? error.message : 'Couldn’t send to the helper.',
      error,
      tone: 'critical',
    });
    return false;
  }
  clearSubmittedDraft(key, revision, quote);
  clearSubmittedUploads(uploadKeys);
  return true;
}
