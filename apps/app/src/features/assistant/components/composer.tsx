import type { ReactNode, RefObject } from 'react';
import type { AiChatRow, AiMessageReference } from '@smarteverything/domain';
import { useComposerState, type ComposerState } from './use-composer-state';
import { CommandTransientProvider } from '../commands/transient';
import { memo, useRef } from 'react';
import type { TextInput } from 'react-native';
import { View } from 'react-native';
import type { ProfileGateProps } from '../../../components/profile-gate';
import type { ReasonAction } from '../../../components/reason-line';
import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
import { useFilePaste } from '../../../platform/file-drop';
import { DEFAULT_DRAFT_KEY } from '../data/ai-drafts';
import { draftText, setReferenceDraft, useDraftSelected } from '../data/drafts';
import { attachFiles } from '../data/uploads';
import { useAiLayout } from '../shell/use-ai-layout';
import { AccessoryRow } from './composer-accessories';
import { ComposerClassProvider } from './composer-accessory-layout';
import { ComposerEditor } from './composer-editor';
import { ComposerField } from './composer-field';
import { ComposerStatusLine } from './composer-status';
import { SuggestionKeys, suggestionKey } from './suggestion-keys';
import { QuoteChip } from './composer-extras';
import { QueueTray } from './queue-tray';
import { ReferenceChips } from '../references/chips';
import { UploadChips } from './upload-chips';
import { HelperMentionChips } from './helper-mention-chips';

export interface SendExtras {
  readonly references?: readonly AiMessageReference[];
  readonly clientMessageId?: string;
  readonly quoteMessageId?: string;
}

export type MessageSender = (
  text: string,
  attachments: readonly string[],
  extras?: SendExtras,
) => Promise<boolean>;

export interface ComposerProps {
  readonly commandChat?: AiChatRow;
  readonly helperOnline?: boolean;
  readonly disabled: boolean;
  readonly reason?: string | null;
  readonly attachmentReason?: string | null;
  readonly placeholder: string;
  readonly focusOnMount?: boolean;
  readonly onSent?: () => void;
  readonly draftKey?: string;
  readonly send: MessageSender;
  readonly stop?: (() => void) | null;
  readonly accessory?: ReactNode;
  readonly tools?: ReactNode;
  readonly rightAccessory?: ReactNode;
  readonly queueFor?: string;
  readonly offline?: boolean;
  readonly onEditLatest?: (() => void) | null;
  readonly shortcuts?: boolean;
  readonly steerable?: boolean;
  readonly profileGate?: ProfileGateProps | null;
  readonly unsupportedUploads?: ReadonlySet<string>;
  readonly fixes?: {
    readonly engine?: readonly ReasonAction[];
    readonly attachment?: readonly ReasonAction[];
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
      draftKey={state.draftKey}
      disabled={config.disabled}
      placeholder={config.placeholder}
      selection={state.mentions.selection}
      onSelection={state.mentions.select}
      onCommandKey={(key): boolean => suggestionKey(key, state.suggestions)}
      onSend={state.send}
      onEscape={() => {
        if (draftText(state.draftKey) === '' && stop !== null) {
          stop();
        } else {
          state.input.current?.blur();
        }
      }}
      onEditLatest={onEditLatest}
    />
  );
}

function Controls({ config, state }: PartProps): ReactNode {
  return (
    <>
      <View className="flex-row px-2">
        <Field config={config} state={state} />
      </View>
      <AccessoryRow config={config} state={state} />
    </>
  );
}

function ComposerCard({ config, state }: PartProps): ReactNode {
  return (
    <View className="rounded-xxl border-hairline border-outline-variant bg-surface-2 p-2 pb-1">
      {state.status === null ? null : (
        <ComposerStatusLine status={state.status} actions={state.statusActions} />
      )}
      {state.quote === null ? null : (
        <QuoteChip
          quote={state.quote}
          onRemove={() => {
            state.setQuote(null);
          }}
        />
      )}
      <UploadChips unsupported={state.unsupportedUploads} />
      <ReferenceChips references={state.references} remove={state.mentions.remove} />
      <HelperMentionChips mentions={state.helperMentions} remove={state.mentions.removeHelper} />
      <Controls config={config} state={state} />
    </View>
  );
}

function EditorHost({ config, state }: PartProps): ReactNode {
  return (
    <ComposerEditor
      open={state.editor}
      onClose={() => {
        state.setEditor(false);
      }}
      draftKey={state.draftKey}
      placeholder={config.placeholder}
      ready={state.ready}
      disabled={config.disabled}
      onSend={state.send}
      mentions={state.mentions}
      references={state.references}
      helperMentions={state.helperMentions}
      quote={state.quote}
      onRemoveQuote={() => {
        state.setQuote(null);
      }}
      status={state.status}
      unsupportedUploads={state.unsupportedUploads}
    />
  );
}

const isFilled = (text: string): boolean => text !== '';

function QueueHost({ config, state }: PartProps): ReactNode {
  const filled = useDraftSelected(state.draftKey, isFilled);
  if (config.queueFor === undefined) return null;
  return (
    <QueueTray
      chatId={config.queueFor}
      fieldHasText={filled}
      onEdit={(message): void => {
        setReferenceDraft(config.draftKey ?? DEFAULT_DRAFT_KEY, {
          text: message.text,
          references: message.references,
        });
        state.input.current?.focus();
      }}
    />
  );
}

function ComposerBase(props: ComposerProps): ReactNode {
  const state = useComposerState(props);
  const { composerClass } = useAiLayout();
  const pasteTarget = useRef<View>(null);
  useFilePaste(pasteTarget, attachFiles);
  useFocusShortcut(state.input, props.shortcuts === true);
  return (
    <ComposerClassProvider value={composerClass}>
      <View ref={pasteTarget} className="gap-2">
        {state.commands.result}
        {state.commands.hint}
        <QueueHost config={props} state={state} />
        <SuggestionKeys suggestions={state.suggestions}>
          <View className="relative">
            {state.editor || state.commands.opened ? null : state.mentions.panel}
            {state.commands.panel}
            <CommandTransientProvider
              opened={state.commands.opened || state.mentions.opened}
              dismiss={(): void => {
                state.commands.dismiss();
                state.mentions.dismiss();
              }}
            >
              <ComposerCard config={props} state={state} />
            </CommandTransientProvider>
          </View>
        </SuggestionKeys>
        <EditorHost config={props} state={state} />
      </View>
    </ComposerClassProvider>
  );
}

export const Composer = memo(ComposerBase);
