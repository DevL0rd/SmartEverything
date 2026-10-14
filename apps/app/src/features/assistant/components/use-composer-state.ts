import { useState, type RefObject } from 'react';
import type { TextInput } from 'react-native';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import {
  draftRevision,
  draftQuote,
  captureDraftSubmission,
  useDraftReferences,
  setReferenceDraft,
  useDraft,
  useQuote,
} from '../data/drafts';
import { readyAttachments, useUploads } from '../data/uploads';
import { quotedText, sendClearing, type Quote } from '../model/composer-state';
import { useReferenceComposer, type ReferenceComposer } from '../references/use-reference-composer';
import type { AiMessageReference } from '@smarteverything/domain';
import { commandIntent } from '../commands/intent';
import { useCommandComposer, type CommandComposer } from '../commands/use-command-composer';
import type { ComposerProps } from './composer';
export interface ComposerState {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly quote: Quote | null;
  readonly setQuote: (quote: Quote | null) => void;
  readonly editor: boolean;
  readonly setEditor: (open: boolean) => void;
  readonly input: RefObject<TextInput | null>;
  readonly filled: boolean;
  readonly send: () => void;
  readonly commands: CommandComposer;
  readonly mentions: ReferenceComposer;
  readonly references: readonly AiMessageReference[];
}

export function useComposerState(props: ComposerProps): ComposerState {
  const { draftKey = 'coordinator', focusOnMount = false } = props;
  const [text, setText] = useDraft(draftKey);
  const [quote, setQuote] = useQuote(draftKey);
  const [editor, setEditor] = useState(false);
  const [sending, setSending] = useState(false);
  const input = useFocusOnMount(focusOnMount);
  const uploads = useUploads();
  const attachments = readyAttachments(uploads);
  const insert = (next: string): void => {
    setText(next);
    input.current?.focus();
  };
  const references = useDraftReferences(draftKey);
  const mentions = useReferenceComposer({
    chat: props.commandChat,
    key: draftKey,
    text,
    references,
    focus: (): void => {
      if (!editor) input.current?.focus();
    },
  });
  const commands = useCommandComposer(props.commandChat, draftKey, text, insert);
  const filled = attachments !== null && (text.trim() !== '' || attachments.length > 0);
  const state = { text, references, quote, setText, setQuote, setEditor };
  const send = composerSend(
    { props, state, attachments, filled, sending, commands, uploads },
    setSending,
  );
  return {
    text,
    commands,
    mentions,
    references,
    setText,
    quote,
    setQuote,
    editor,
    setEditor,
    input,
    filled: filled && !sending,
    send,
  };
}

function sendNormal(
  props: ComposerProps,
  state: Pick<
    ComposerState,
    'text' | 'references' | 'quote' | 'setText' | 'setQuote' | 'setEditor'
  >,
  attachments: readonly string[],
): Promise<void> {
  const key = props.draftKey ?? 'coordinator';
  const text = quotedText(state.text, state.quote);
  const offset = text.length - state.text.length;
  const references = state.references.map((item) => ({
    ...item,
    start: item.start + offset,
    end: item.end + offset,
  }));
  const submission = captureDraftSubmission(key, text, attachments, references);
  let clearedRevision = -1;
  return sendClearing(() => props.send(text, attachments, references, submission.id), {
    clear: (): void => {
      state.setText('');
      clearedRevision = draftRevision(key);
      state.setQuote(null);
      state.setEditor(false);
    },
    restore: (): void => {
      if (draftRevision(key) !== clearedRevision) return;
      setReferenceDraft(key, { text: state.text, references: state.references }, submission);
      if (draftQuote(key) === null) state.setQuote(state.quote);
    },
    sent: (): void => {
      props.onSent?.();
    },
  });
}

function composerSend(
  input: {
    readonly props: ComposerProps;
    readonly state: Pick<
      ComposerState,
      'text' | 'references' | 'quote' | 'setText' | 'setQuote' | 'setEditor'
    >;
    readonly attachments: readonly string[] | null;
    readonly filled: boolean;
    readonly sending: boolean;
    readonly commands: CommandComposer;
    readonly uploads: ReturnType<typeof useUploads>;
  },
  setSending: (sending: boolean) => void,
): () => void {
  return (): void => {
    const { props, state, attachments, filled, sending, commands, uploads } = input;
    if (!filled || sending || props.disabled || props.sendDisabled === true || attachments === null)
      return;
    setSending(true);
    const work =
      commandIntent(state.text).kind === 'text'
        ? sendNormal(props, state, attachments)
        : commands.submit(state.quote, uploads);
    void work.finally(() => {
      setSending(false);
    });
  };
}
