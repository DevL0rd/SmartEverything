import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import type { AiMessageReference } from '@smarteverything/domain';
import type { ReferenceComposer } from '../references/use-reference-composer';
import { ReferenceChips } from '../references/chips';
import type { HelperMention } from '../model/helper-target';
import type { ComposerStatus, Quote } from '../model/composer-state';
import { HelperMentionChips } from './helper-mention-chips';
import { QuoteChip, VoiceMessageButton } from './composer-extras';
import { ComposerStatusLine } from './composer-status';
import { ComposerField } from './composer-field';
import { SuggestionKeys, suggestionKey } from './suggestion-keys';
import { UploadChips } from './upload-chips';

interface EditorProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly draftKey: string;
  readonly placeholder: string;
  readonly ready: boolean;
  readonly disabled: boolean;
  readonly onSend: () => void;
  readonly mentions: ReferenceComposer;
  readonly references: readonly AiMessageReference[];
  readonly helperMentions: readonly HelperMention[];
  readonly quote: Quote | null;
  readonly onRemoveQuote: () => void;
  readonly status: ComposerStatus | null;
  readonly unsupportedUploads: ReadonlySet<string>;
}
function ComposerEditorBase(props: EditorProps): ReactNode {
  const { open, onClose, draftKey, ready, disabled, onSend } = props;
  const input = useFocusOnMount(open);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Message"
      detents={['full']}
      scroll={false}
      footer={
        open ? (
          <>
            <VoiceMessageButton
              key={draftKey}
              draftKey={draftKey}
              disabled={disabled}
              onSend={onSend}
            />
            <Button
              label="Send"
              icon="arrowUp"
              disabled={disabled || !ready}
              onPress={onSend}
              grow
            />
          </>
        ) : undefined
      }
    >
      {open ? <EditorBody {...props} input={input} /> : null}
    </Sheet>
  );
}

function EditorBody({
  input,
  onClose,
  draftKey,
  placeholder,
  disabled,
  onSend,
  mentions,
  references,
  helperMentions,
  quote,
  onRemoveQuote,
  status,
  unsupportedUploads,
}: EditorProps & { readonly input: ReturnType<typeof useFocusOnMount> }): ReactNode {
  return (
    <SuggestionKeys suggestions={mentions.suggestions} className="min-h-0 flex-1">
      <View className="min-h-0 flex-1 gap-2 rounded-lg bg-surface-2 px-2">
        {mentions.editorPanel}
        {status?.kind === 'helper' ? <ComposerStatusLine status={status} actions={[]} /> : null}
        {quote?.helperChatId === undefined ? null : (
          <QuoteChip quote={quote} onRemove={onRemoveQuote} />
        )}
        <UploadChips unsupported={unsupportedUploads} />
        <HelperMentionChips mentions={helperMentions} remove={mentions.removeHelper} />
        <ReferenceChips references={references} remove={mentions.remove} />
        <ComposerField
          input={input}
          draftKey={draftKey}
          disabled={disabled}
          placeholder={placeholder}
          onSend={onSend}
          selection={mentions.selection}
          onSelection={mentions.select}
          onCommandKey={(key): boolean => suggestionKey(key, mentions.suggestions)}
          onEscape={onClose}
          onEditLatest={null}
          tall
        />
      </View>
    </SuggestionKeys>
  );
}

export const ComposerEditor = memo(ComposerEditorBase, (left, right) => !left.open && !right.open);
