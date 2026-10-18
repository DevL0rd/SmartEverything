import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import type { TextInput } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import {
  draftRevision,
  draftQuote,
  captureDraftSubmission,
  clearDraft,
  draftText,
  useDraftReferences,
  useDraftSelected,
  setDraft,
  setReferenceDraft,
  useQuote,
} from '../data/drafts';
import { DEFAULT_DRAFT_KEY } from '../data/ai-drafts';
import { readyAttachments, useUploads } from '../data/uploads';
import { setSendPhase, useSendPhase } from './send-phase';
import {
  quotedText,
  sendClearing,
  sendModeOf,
  statusOf,
  wantsEditor,
  uploadsSummary,
  type ComposerStatus,
  type Quote,
  type SendMode,
  type StatusFacts,
  type StatusKind,
} from '../model/composer-state';
import { useReferenceComposer, type ReferenceComposer } from '../references/use-reference-composer';
import type { ReasonAction } from '../../../components/reason-line';
import type { Suggestions } from './suggestion-keys';
import type { AiMessageReference } from '@smarteverything/domain';
import { commandIntent } from '../commands/intent';
import { useCommandComposer, type CommandComposer } from '../commands/use-command-composer';
import type { ComposerProps } from './composer';
const log = new Logger('app.composer');

export interface ComposerState {
  readonly draftKey: string;
  readonly hasText: boolean;
  readonly expandable: boolean;
  readonly setText: (text: string) => void;
  readonly quote: Quote | null;
  readonly setQuote: (quote: Quote | null) => void;
  readonly editor: boolean;
  readonly setEditor: (open: boolean) => void;
  readonly input: RefObject<TextInput | null>;
  readonly ready: boolean;
  readonly mode: SendMode;
  readonly status: ComposerStatus | null;
  readonly statusActions: readonly ReasonAction[];
  readonly suggestions: Suggestions;
  readonly ring: number;
  readonly send: () => void;
  readonly commands: CommandComposer;
  readonly mentions: ReferenceComposer;
  readonly references: readonly AiMessageReference[];
}

type DraftFields = Pick<
  ComposerState,
  'draftKey' | 'references' | 'quote' | 'setText' | 'setQuote' | 'setEditor'
>;

type DraftParts = DraftFields & Pick<ComposerState, 'editor' | 'input' | 'commands' | 'mentions'>;

function useDraftParts(props: ComposerProps): DraftParts {
  const { draftKey = DEFAULT_DRAFT_KEY, focusOnMount = false } = props;
  const setText = (next: string): void => {
    setDraft(draftKey, next);
  };
  const [quote, setQuote] = useQuote(draftKey);
  const [editor, setEditor] = useState(false);
  const input = useFocusOnMount(focusOnMount);
  const references = useDraftReferences(draftKey);
  const mentions = useReferenceComposer({
    chat: props.commandChat,
    key: draftKey,
    references,
    focus: (): void => {
      if (!editor) input.current?.focus();
    },
  });
  const commands = useCommandComposer({
    chat: props.commandChat,
    draftKey,
    setText: (next): void => {
      setText(next);
      input.current?.focus();
    },
    quote:
      quote === null
        ? null
        : {
            remove: (): void => {
              setQuote(null);
            },
          },
  });
  return {
    draftKey,
    setText,
    quote,
    setQuote,
    editor,
    setEditor,
    input,
    references,
    mentions,
    commands,
  };
}

interface Sender {
  readonly hasText: boolean;
  readonly summary: ReturnType<typeof uploadsSummary>;
  readonly hasContent: boolean;
  readonly blocked: boolean;
  readonly armed: boolean;
  readonly textOnly: boolean;
  readonly send: () => void;
  readonly cancelArmed: () => void;
}

function isBlocked(props: ComposerProps): boolean {
  return (
    props.disabled ||
    (props.reason ?? null) !== null ||
    (props.profileGate ?? null) !== null ||
    (props.attachmentReason ?? null) !== null
  );
}

const hasTextOf = (text: string): boolean => text.trim() !== '';

function submitDraft(input: {
  readonly key: string;
  readonly props: ComposerProps;
  readonly state: DraftParts;
  readonly attachments: readonly string[];
  readonly uploads: ReturnType<typeof useUploads>;
}): void {
  const { key, props, state, attachments, uploads } = input;
  const startedAt = Date.now();
  log.info('send.started', {
    draftKey: key,
    attachments: attachments.length,
    chatId: props.queueFor ?? props.commandChat?.id ?? null,
  });
  setSendPhase(key, 'sending');
  deliverDraft({ props, state, attachments, uploads })
    .then(() => {
      log.debug('send.settled', () => ({ draftKey: key, durationMs: Date.now() - startedAt }));
    })
    .catch((error: unknown) => {
      log.error('send.failed', error, { draftKey: key, durationMs: Date.now() - startedAt });
    })
    .finally(() => {
      setSendPhase(key, null);
    });
}

function logIgnored(key: string, facts: Readonly<Record<string, unknown>>): void {
  log.debug('send.ignored', () => ({ draftKey: key, ...facts }));
}

function arm(key: string, pendingUploads: number): void {
  log.info('send.armed', { draftKey: key, pendingUploads });
  setSendPhase(key, 'armed');
}

function useSender(props: ComposerProps, parts: DraftParts): Sender {
  const key = props.draftKey ?? DEFAULT_DRAFT_KEY;
  const phase = useSendPhase(key);
  const uploads = useUploads();
  const summary = uploadsSummary(uploads);
  const attachments = readyAttachments(uploads);
  const hasText = useDraftSelected(key, hasTextOf);
  const hasContent = (hasText || uploads.length > 0) && phase !== 'sending';
  const blocked = isBlocked(props) || summary.failed > 0;
  const submit = (ready: readonly string[]): void => {
    submitDraft({ key, props, state: parts, attachments: ready, uploads });
  };
  const armed = phase === 'armed';
  const settle = useEffectEvent((): void => {
    if (summary.failed > 0) {
      log.warn('send.disarmed', { draftKey: key, failedUploads: summary.failed });
      setSendPhase(key, null);
    } else if (attachments !== null) submit(attachments);
  });
  useEffect(() => {
    if (armed) settle();
  }, [armed, attachments, summary.failed]);
  useEffect(
    (): (() => void) => () => {
      setSendPhase(key, null);
    },
    [key],
  );
  return {
    hasText,
    summary,
    hasContent,
    blocked,
    armed,
    textOnly: uploads.length === 0,
    send: (): void => {
      if (!hasContent || blocked || phase !== null) {
        logIgnored(key, { hasContent, blocked, phase, failedUploads: summary.failed });
        return;
      }
      if (attachments === null) arm(key, summary.pending);
      else submit(attachments);
    },
    cancelArmed: (): void => {
      log.info('send.cancelled', { draftKey: key });
      setSendPhase(key, null);
    },
  };
}

const NO_ACTIONS: readonly ReasonAction[] = [];

function actionsByStatus(
  props: ComposerProps,
  cancelArmed: () => void,
): Readonly<Record<StatusKind, readonly ReasonAction[]>> {
  const gate = props.profileGate ?? null;
  return {
    engine: props.fixes?.engine ?? NO_ACTIONS,
    attachment: props.fixes?.attachment ?? NO_ACTIONS,
    profile: gate === null ? NO_ACTIONS : [{ label: 'Switch profile', onPress: gate.onSwitch }],
    uploading: [{ label: 'Cancel', onPress: cancelArmed }],
    failedUpload: NO_ACTIONS,
    offline: NO_ACTIONS,
  };
}

function statusFactsOf(props: ComposerProps, sender: Sender): StatusFacts {
  return {
    engineReason: props.reason ?? null,
    profileName: props.profileGate?.profileName ?? null,
    attachmentReason: props.attachmentReason ?? null,
    failedUploads: sender.summary.failed,
    armedUploads: sender.armed ? sender.summary.pending : 0,
    offline: props.offline === true,
  };
}

export function useComposerState(props: ComposerProps): ComposerState {
  const parts = useDraftParts(props);
  const sender = useSender(props, parts);
  const status = statusOf(statusFactsOf(props, sender));
  const expandable = useDraftSelected(parts.draftKey, wantsEditor);
  const mode = sendModeOf({
    hasContent: sender.hasContent,
    uploading: sender.summary.pending > 0,
    working: (props.stop ?? null) !== null,
    blocked: sender.blocked,
    offline: props.offline === true,
    steerable: props.steerable === true && sender.textOnly && parts.references.length === 0,
  });
  const statusKind = status?.kind ?? null;
  useEffect(() => {
    log.debug('mode.changed', { draftKey: parts.draftKey, mode, status: statusKind });
  }, [parts.draftKey, mode, statusKind]);
  return {
    ...parts,
    hasText: sender.hasText,
    expandable,
    ready: sender.hasContent && !sender.blocked,
    mode,
    status,
    statusActions:
      status === null ? NO_ACTIONS : actionsByStatus(props, sender.cancelArmed)[status.kind],
    suggestions: parts.commands.suggestions.open
      ? parts.commands.suggestions
      : parts.mentions.suggestions,
    ring: sender.summary.progress,
    send: sender.send,
  };
}

function sendNormal(
  props: ComposerProps,
  state: DraftFields,
  attachments: readonly string[],
): Promise<void> {
  const key = props.draftKey ?? DEFAULT_DRAFT_KEY;
  const raw = draftText(key);
  const text = quotedText(raw, state.quote);
  const offset = text.length - raw.length;
  const references = state.references.map((item) => ({
    ...item,
    start: item.start + offset,
    end: item.end + offset,
  }));
  const submission = captureDraftSubmission(key, text, attachments, references);
  let clearedRevision = -1;
  return sendClearing(() => props.send(text, attachments, references, submission.id), {
    clear: (): void => {
      clearDraft(key);
      clearedRevision = draftRevision(key);
      state.setEditor(false);
    },
    restore: (): void => {
      if (draftRevision(key) !== clearedRevision) {
        log.info('send.restore_skipped', { draftKey: key, reason: 'draft-edited' });
        return;
      }
      log.warn('send.restored', { draftKey: key, textLength: raw.length });
      setReferenceDraft(key, { text: raw, references: state.references }, submission);
      if (draftQuote(key) === null) state.setQuote(state.quote);
    },
    sent: (): void => {
      props.onSent?.();
    },
  });
}

async function deliverDraft(input: {
  readonly props: ComposerProps;
  readonly state: DraftParts;
  readonly attachments: readonly string[];
  readonly uploads: ReturnType<typeof useUploads>;
}): Promise<void> {
  const { props, state, attachments, uploads } = input;
  if (commandIntent(draftText(state.draftKey)).kind === 'text') {
    await sendNormal(props, state, attachments);
    return;
  }
  await state.commands.submit(state.quote, uploads);
}
