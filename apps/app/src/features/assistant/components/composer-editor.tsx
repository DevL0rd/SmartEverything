import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import { ComposerField } from './composer-field';

function ComposerEditorBase({
  open,
  onClose,
  text,
  setText,
  placeholder,
  ready,
  onSend,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly placeholder: string;
  readonly ready: boolean;
  readonly onSend: () => void;
}): ReactNode {
  const input = useFocusOnMount(open);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Message"
      detents={['full']}
      scroll={false}
      footer={<Button label="Send" icon="arrowUp" disabled={!ready} onPress={onSend} grow />}
    >
      {open ? (
        <View className="min-h-0 flex-1 rounded-lg bg-surface-2 px-2">
          <ComposerField
            input={input}
            text={text}
            setText={setText}
            disabled={false}
            placeholder={placeholder}
            onSend={onSend}
            onEscape={onClose}
            onEditLatest={null}
            tall
          />
        </View>
      ) : null}
    </Sheet>
  );
}

export const ComposerEditor = memo(ComposerEditorBase, (left, right) => !left.open && !right.open);
