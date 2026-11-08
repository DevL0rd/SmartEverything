import type { AiMessageReference } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ComposerProps } from './composer';
import { DEFAULT_DRAFT_KEY, type DraftSubmission } from '../data/ai-drafts';
import {
  draftRevision,
  draftQuote,
  captureDraftSubmission,
  clearDraft,
  clearDraftSubmission,
  draftSubmission,
  draftText,
  setReferenceDraft,
} from '../data/drafts';
import { sendClearing, type Quote, type SendEffects } from '../model/composer-state';

const log = new Logger('app.composer');
interface NormalDraft {
  readonly references: readonly AiMessageReference[];
  readonly quote: Quote | null;
  readonly setQuote: (quote: Quote | null) => void;
  readonly setEditor: (open: boolean) => void;
}

export function sendNormal(
  props: ComposerProps,
  state: NormalDraft,
  attachments: readonly string[],
): Promise<void> {
  const key = props.draftKey ?? DEFAULT_DRAFT_KEY;
  const raw = draftText(key);
  const { references, quote } = state;
  const quoteMessageId = quote?.messageId;
  const submission = captureDraftSubmission(key, {
    text: raw,
    attachments,
    references,
    quoteMessageId,
    quote,
  });
  return sendClearing(
    () =>
      props.send(raw, attachments, {
        references,
        clientMessageId: submission.id,
        ...(quoteMessageId === undefined ? {} : { quoteMessageId }),
      }),
    draftEffects({ key, raw, submission, state, onSent: props.onSent }),
  );
}

interface DeliveryDraft {
  readonly key: string;
  readonly raw: string;
  readonly submission: DraftSubmission;
  readonly state: NormalDraft;
  readonly onSent: (() => void) | undefined;
}

function draftEffects(input: DeliveryDraft): SendEffects {
  const { key, raw, submission, state, onSent } = input;
  let clearedRevision = -1;
  return {
    clear: (): void => {
      clearDraft(key, submission);
      clearedRevision = draftRevision(key);
      state.setEditor(false);
    },
    restore: (): void => {
      const pending = draftSubmission(key, submission.id);
      if (draftRevision(key) !== clearedRevision || pending === undefined) {
        log.info('send.restore_skipped', { draftKey: key, reason: 'draft-edited' });
        return;
      }
      log.warn('send.restored', { draftKey: key, textLength: raw.length });
      setReferenceDraft(key, { text: raw, references: state.references }, pending);
      if (draftQuote(key) === null) state.setQuote(state.quote);
    },
    sent: (): void => {
      clearDraftSubmission(key, submission.id);
      onSent?.();
    },
  };
}
