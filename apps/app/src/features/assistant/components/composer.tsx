import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import type { TextInput } from 'react-native';
import { View } from 'react-native';
import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import { useIdiom } from '../../../design/platform';
import { useFilePaste } from '../../../platform/file-drop';
import { useDraft, useQuote } from '../data/drafts';
import { attachFiles, readyAttachments, useUploads } from '../data/uploads';
import {
  quotedText,
  sendClearing,
  sendModeOf,
  showsCounter,
  type Quote,
} from '../model/composer-state';
import { ComposerEditor } from './composer-editor';
import { ComposerField } from './composer-field';
import { AttachButton, Counter, ExpandButton, OfflineHint, QuoteChip } from './composer-extras';
import { SendButton } from './composer-send';
import { UploadChips } from './upload-chips';

export type MessageSender = (text: string, attachments: readonly string[]) => Promise<boolean>;

const EXPAND_LINES = 4;

const EXPAND_CHARS = 240;

function wantsEditor(text: string): boolean {
  return text.split('\n').length > EXPAND_LINES || text.length > EXPAND_CHARS;
}

export interface ComposerProps {
  readonly disabled: boolean;
  readonly placeholder: string;
  readonly focusOnMount?: boolean;
  readonly onSent?: () => void;
  readonly draftKey?: string;
  readonly send: MessageSender;
  readonly stop?: (() => void) | null;
  readonly accessory?: ReactNode;
  readonly offline?: boolean;
  readonly onEditLatest?: (() => void) | null;
  readonly shortcuts?: boolean;
}

interface ComposerState {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly quote: Quote | null;
  readonly setQuote: (quote: Quote | null) => void;
  readonly editor: boolean;
  readonly setEditor: (open: boolean) => void;
  readonly input: RefObject<TextInput | null>;
  readonly filled: boolean;
  readonly send: () => void;
}

function useComposerState(props: ComposerProps): ComposerState {
  const { draftKey = 'coordinator', focusOnMount = false, onSent, send: deliver } = props;
  const [text, setText] = useDraft(draftKey);
  const [quote, setQuote] = useQuote(draftKey);
  const [editor, setEditor] = useState(false);
  const [sending, setSending] = useState(false);
  const input = useFocusOnMount(focusOnMount);
  const attachments = readyAttachments(useUploads());
  const filled = attachments !== null && (text.trim() !== '' || attachments.length > 0);
  const send = (): void => {
    if (!filled || sending) {
      return;
    }
    setSending(true);
    void sendClearing(() => deliver(quotedText(text, quote), attachments), {
      clear: () => {
        setText('');
        setQuote(null);
        setEditor(false);
      },
      restore: () => {
        setText(text);
        setQuote(quote);
      },
      sent: () => onSent?.(),
    }).finally(() => {
      setSending(false);
    });
  };
  return {
    text,
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

function useFocusShortcut(input: RefObject<TextInput | null>, enabled: boolean): void {
  useKeyboard((press: KeyPress) => {
    if (!enabled || !press.command || press.key !== '/') {
      return false;
    }
    input.current?.focus();
    return true;
  }, true);
}

interface PartProps {
  readonly config: ComposerProps;
  readonly state: ComposerState;
}

function Field({ config, state }: PartProps): ReactNode {
  const { stop = null, onEditLatest = null } = config;
  return (
    <ComposerField
      input={state.input}
      text={state.text}
      setText={state.setText}
      disabled={config.disabled}
      placeholder={config.placeholder}
      onSend={state.send}
      onEscape={() => {
        if (state.text === '' && stop !== null) {
          stop();
        } else {
          state.input.current?.blur();
        }
      }}
      onEditLatest={onEditLatest}
    />
  );
}

function Action({ config, state }: PartProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const { stop = null, offline = false } = config;
  const mode = sendModeOf(state.filled && !config.disabled, stop !== null, offline);
  return (
    <SendButton
      mode={mode}
      onSend={state.send}
      onStop={() => {
        stop?.();
      }}
      shortcut={pointer ? 'Enter' : null}
    />
  );
}

function Rows({ config, state }: PartProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <>
      <View className="flex-row px-2">
        <Field config={config} state={state} />
      </View>
      {config.offline === true ? <OfflineHint /> : null}
      {showsCounter(state.text.length) ? (
        <View className="items-end px-2">
          <Counter length={state.text.length} />
        </View>
      ) : null}
      <View className="flex-row items-center gap-1">
        <AttachButton disabled={false} />
        {config.accessory}
        <View className="flex-1" />
        {!pointer && wantsEditor(state.text) ? (
          <ExpandButton
            onPress={() => {
              state.setEditor(true);
            }}
          />
        ) : null}
        <Action config={config} state={state} />
      </View>
    </>
  );
}

export function Composer(props: ComposerProps): ReactNode {
  const state = useComposerState(props);
  useFilePaste(state.input, attachFiles);
  useFocusShortcut(state.input, props.shortcuts === true);
  const { quote, setQuote } = state;
  const plain = props.accessory === undefined || props.accessory === null;
  return (
    <View className="gap-2">
      <UploadChips />
      <View className="rounded-xxl border-hairline border-outline-variant bg-surface-2 p-1">
        {quote === null ? null : (
          <QuoteChip
            quote={quote}
            onRemove={() => {
              setQuote(null);
            }}
          />
        )}
        {plain ? (
          <View className="flex-row items-end gap-1">
            <AttachButton disabled={props.disabled} />
            <Field config={props} state={state} />
            <Action config={props} state={state} />
          </View>
        ) : (
          <Rows config={props} state={state} />
        )}
      </View>
      <ComposerEditor
        open={state.editor}
        onClose={() => {
          state.setEditor(false);
        }}
        text={state.text}
        setText={state.setText}
        placeholder={props.placeholder}
        ready={state.filled}
        onSend={state.send}
      />
    </View>
  );
}
