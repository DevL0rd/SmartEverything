import { useEffect, useState, type RefObject } from 'react';
import type { TextInput } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import {
  draftText,
  useDraftReferences,
  useHelperMentions,
  useDraftSelected,
  setDraft,
  useQuote,
} from '../data/drafts';
import { sendNormal } from './send-normal-draft';
import { DEFAULT_DRAFT_KEY } from '../data/ai-drafts';
import { readyAttachments, useUploads } from '../data/uploads';
import { beginSend, setSendPhase, useArmedSend, useSendPhase } from './send-phase';
import {
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
import { useHelperAddress, type HelperAddress } from './use-helper-address';
import { withoutHelperMentions, type HelperMention } from '../model/helper-target';
import { sendHelper } from '../data/send-helper';
import { useFeatureSupport } from '../data/feature-support';
import { unsupportedReason, useUnsupportedHelperUploads } from '../provider/codex-attachments';
const NO_UPLOADS: ReadonlySet<string> = new Set();
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
  readonly unsupportedUploads: ReadonlySet<string>;
  readonly send: () => void;
  readonly commands: CommandComposer;
  readonly mentions: ReferenceComposer;
  readonly references: readonly AiMessageReference[];
  readonly helperMentions: readonly HelperMention[];
}

type DraftFields = Pick<
  ComposerState,
  'draftKey' | 'references' | 'quote' | 'setText' | 'setQuote' | 'setEditor' | 'helperMentions'
>;

type DraftParts = DraftFields &
  Pick<ComposerState, 'editor' | 'input' | 'commands' | 'mentions'> &
  HelperAddress;

function useDraftFields(draftKey: string): Omit<DraftFields, 'setEditor'> {
  const [quote, setQuote] = useQuote(draftKey);
  const references = useDraftReferences(draftKey);
  const helperMentions = useHelperMentions(draftKey);
  const setText = (next: string): void => {
    setDraft(draftKey, next);
  };
  return { draftKey, quote, setQuote, references, helperMentions, setText };
}

function useDraftParts(props: ComposerProps): DraftParts {
  const { draftKey = DEFAULT_DRAFT_KEY, focusOnMount = false } = props;
  const draft = useDraftFields(draftKey);
  const { quote, setQuote, references, helperMentions, setText } = draft;
  const [editor, setEditor] = useState(false);
  const input = useFocusOnMount(focusOnMount);
  const helper = useHelperAddress(
    { parent: props.commandChat, online: props.helperOnline, hasReferences: references.length > 0 },
    helperMentions,
    quote,
  );
  const mentions = useReferenceComposer({
    chat: props.commandChat,
    key: draftKey,
    references,
    helperMentions,
    helpersEnabled: props.helperOnline !== undefined,
    focus: (): void => {
      if (!editor) input.current?.focus();
    },
  });
  const commands = useCommandComposer({
    chat: props.commandChat,
    draftKey,
    directed: helper.address.kind !== 'ordinary',
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
  return { ...draft, editor, setEditor, input, ...helper, mentions, commands };
}

interface Sender {
  readonly hasText: boolean;
  readonly summary: ReturnType<typeof uploadsSummary>;
  readonly hasContent: boolean;
  readonly blocked: boolean;
  readonly helperReason: string | null;
  readonly unsupportedUploads: ReadonlySet<string>;
  readonly armed: boolean;
  readonly textOnly: boolean;
  readonly send: () => void;
  readonly cancelArmed: () => void;
}

function isBlocked(props: ComposerProps, directed: boolean): boolean {
  return (
    props.disabled ||
    (!directed && (props.reason ?? null) !== null) ||
    (props.profileGate ?? null) !== null ||
    (!directed && (props.attachmentReason ?? null) !== null)
  );
}

function contentOf(text: string, parts: DraftParts): boolean {
  return parts.address.kind === 'ordinary'
    ? text.trim() !== ''
    : withoutHelperMentions(text, parts.helperMentions) !== '';
}

function submitDraft(input: {
  readonly key: string;
  readonly props: ComposerProps;
  readonly state: DraftParts;
  readonly attachments: readonly string[];
  readonly uploads: ReturnType<typeof useUploads>;
}): void {
  const { key, props, state, attachments, uploads } = input;
  if (!beginSend(key)) {
    logIgnored(key, { reason: 'already-sending' });
    return;
  }
  const startedAt = Date.now();
  log.info('send.started', {
    draftKey: key,
    attachments: attachments.length,
    chatId: props.queueFor ?? props.commandChat?.id ?? null,
  });
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

function useHelperUploadReason(
  parts: DraftParts,
  uploads: number,
  unsupported: ReturnType<typeof useUnsupportedHelperUploads>,
): string | null {
  const engine = parts.target?.engine;
  const target = uploads > 0 && engine?.kind === 'dsh' ? engine.execution_target : null;
  const supported = useFeatureSupport('helperAttachments', target);
  if (parts.reason !== null) return parts.reason;
  if (target !== null && !supported)
    return 'The helper’s execution host isn’t ready to receive attachments.';
  return unsupportedReason(unsupported);
}

function useSender(props: ComposerProps, parts: DraftParts): Sender {
  const key = props.draftKey ?? DEFAULT_DRAFT_KEY;
  const phase = useSendPhase(key);
  const uploads = useUploads();
  const summary = uploadsSummary(uploads);
  const attachments = readyAttachments(uploads);
  const directed = parts.address.kind !== 'ordinary';
  const hasText = useDraftSelected(key, (text) => contentOf(text, parts));
  const hasContent = (hasText || uploads.length > 0) && phase !== 'sending';
  const unsupported = useUnsupportedHelperUploads(parts.target, uploads);
  const reason = useHelperUploadReason(parts, uploads.length, unsupported);
  const unsupportedUploads = directed
    ? new Set(unsupported.map((upload) => upload.key))
    : (props.unsupportedUploads ?? NO_UPLOADS);
  const blocked = isBlocked(props, directed) || summary.failed > 0 || reason !== null;
  const submit = (ready: readonly string[]): void => {
    submitDraft({ key, props, state: parts, attachments: ready, uploads });
  };
  const address = parts.address;
  const targetKey = address.kind === 'helper' ? JSON.stringify(address.target) : address.kind;
  const allowed = hasContent && !blocked;
  const pending = useArmedSend({
    key,
    targetKey,
    armed: phase === 'armed',
    allowed,
    attachments,
    submit,
  });
  return {
    hasText,
    summary,
    hasContent,
    blocked,
    helperReason: reason,
    unsupportedUploads,
    armed: phase === 'armed',
    textOnly: uploads.length === 0,
    send: (): void => {
      if (!allowed || phase !== null) {
        logIgnored(key, { hasContent, blocked, phase, failedUploads: summary.failed });
        return;
      }
      pending.send(summary.pending);
    },
    cancelArmed: pending.cancel,
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
    helper: NO_ACTIONS,
  };
}

function statusOfComposer(
  facts: StatusFacts,
  reason: string | null,
  directed: boolean,
): ComposerStatus | null {
  if (!directed) return statusOf(facts);
  if (facts.profileName === null && reason !== null) return { kind: 'helper', text: reason };
  return statusOf({ ...facts, engineReason: null, attachmentReason: null });
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

function modeOfComposer(props: ComposerProps, sender: Sender, parts: DraftParts): SendMode {
  return sendModeOf({
    hasContent: sender.hasContent,
    uploading: sender.summary.pending > 0,
    working: parts.address.kind === 'ordinary' && (props.stop ?? null) !== null,
    blocked: sender.blocked,
    offline: props.offline === true,
    steerable: props.steerable === true && sender.textOnly && parts.references.length === 0,
  });
}

export function useComposerState(props: ComposerProps): ComposerState {
  const parts = useDraftParts(props);
  const sender = useSender(props, parts);
  const directed = parts.address.kind !== 'ordinary';
  const facts = statusFactsOf(props, sender);
  const status = statusOfComposer(facts, sender.helperReason, directed && !props.disabled);
  const expandable = useDraftSelected(parts.draftKey, wantsEditor);
  const mode = modeOfComposer(props, sender, parts);
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
    unsupportedUploads: sender.unsupportedUploads,
    send: sender.send,
  };
}

async function deliverDraft(input: {
  readonly props: ComposerProps;
  readonly state: DraftParts;
  readonly attachments: readonly string[];
  readonly uploads: ReturnType<typeof useUploads>;
}): Promise<void> {
  const { props, state, attachments, uploads } = input;
  if (state.address.kind === 'helper') {
    if (
      await sendHelper({
        key: state.draftKey,
        target: state.address.target,
        mentions: state.helperMentions,
        quote: state.quote,
        attachments,
        uploadKeys: uploads.map((upload) => upload.key),
      })
    ) {
      state.setEditor(false);
      props.onSent?.();
    }
    return;
  }
  if (commandIntent(draftText(state.draftKey)).kind === 'text') {
    await sendNormal(props, state, attachments);
    return;
  }
  await state.commands.submit(state.quote, uploads);
}
