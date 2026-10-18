import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import type { AiMessageReference } from '@smarteverything/domain';
import type { ReferenceComposer } from '../references/use-reference-composer';
import { ReferenceChips } from '../references/chips';
import { ComposerField } from './composer-field';
import { SuggestionKeys, suggestionKey } from './suggestion-keys';

interface EditorProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly draftKey: string;
  readonly placeholder: string;
  readonly ready: boolean;
  readonly onSend: () => void;
  readonly mentions: ReferenceComposer;
  readonly references: readonly AiMessageReference[];
}
function ComposerEditorBase({
  open,
  onClose,
  draftKey,
  placeholder,
  ready,
  onSend,
  mentions,
  references,
}: EditorProps): ReactNode {
  const input = useFocusOnMount(open);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Message"
      detents={['full']}
      scroll={false}
      footer={editorSend(ready, onSend)}
    >
      {open ? (
        <SuggestionKeys suggestions={mentions.suggestions} className="min-h-0 flex-1">
          <View className="min-h-0 flex-1 gap-2 rounded-lg bg-surface-2 px-2">
            {mentions.editorPanel}
            <ReferenceChips references={references} remove={mentions.remove} />
            <ComposerField
              input={input}
              draftKey={draftKey}
              disabled={false}
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
      ) : null}
    </Sheet>
  );
}

export const ComposerEditor = memo(ComposerEditorBase, (left, right) => !left.open && !right.open);

function editorSend(ready: boolean, onSend: () => void): ReactNode {
  return <Button label="Send" icon="arrowUp" disabled={!ready} onPress={onSend} grow />;
}
