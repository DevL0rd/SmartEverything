import { useState, type RefObject } from 'react';
import type { TextInput } from 'react-native';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import { useDraft, useQuote } from '../data/drafts';
import { readyAttachments, useUploads } from '../data/uploads';
import { quotedText, sendClearing, type Quote } from '../model/composer-state';
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
  const commands = useCommandComposer(props.commandChat, draftKey, text, insert);
  const filled = attachments !== null && (text.trim() !== '' || attachments.length > 0);
  const send = (): void => {
    if (!filled || sending || props.disabled || props.sendDisabled === true) {
      return;
    }
    setSending(true);
    if (commandIntent(text).kind !== 'text') {
      void commands.submit(quote, uploads).finally(() => {
        setSending(false);
      });
      return;
    }
    void sendNormal(props, { text, quote, setText, setQuote, setEditor }, attachments).finally(
      () => {
        setSending(false);
      },
    );
  };
  return {
    text,
    commands,
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
  state: Pick<ComposerState, 'text' | 'quote' | 'setText' | 'setQuote' | 'setEditor'>,
  attachments: readonly string[],
): Promise<void> {
  return sendClearing(() => props.send(quotedText(state.text, state.quote), attachments), {
    clear: (): void => {
      state.setText('');
      state.setQuote(null);
      state.setEditor(false);
    },
    restore: (): void => {
      state.setText(state.text);
      state.setQuote(state.quote);
    },
    sent: (): void => {
      props.onSent?.();
    },
  });
}
