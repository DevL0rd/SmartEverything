import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View, type TextInputKeyPressEvent } from 'react-native';
import { ASSISTANT_TEXT_MAX, type AssistantMessageRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import { useIdiom } from '../../../design/platform';
import { stopEditing } from '../data/editing';
import { editMessage } from '../data/send';

function enterPressed(event: TextInputKeyPressEvent): boolean {
  const native = event.nativeEvent;
  const shift = 'shiftKey' in native && native.shiftKey === true;
  return native.key === 'Enter' && !shift;
}

function useSave(
  row: AssistantMessageRow,
  text: string,
): { readonly saving: boolean; readonly save: () => void } {
  const [saving, setSaving] = useState(false);
  return {
    saving,
    save: (): void => {
      if (text.trim() === '' || saving) {
        return;
      }
      if (text.trim() === row.text.trim()) {
        stopEditing();
        return;
      }
      setSaving(true);
      void editMessage(row, text).then((saved) => {
        setSaving(false);
        if (saved) {
          stopEditing();
        }
      });
    },
  };
}

function EditField({
  text,
  setText,
  saving,
  save,
}: {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly saving: boolean;
  readonly save: () => void;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const input = useFocusOnMount(true);
  return (
    <TextInput
      ref={input}
      multiline
      value={text}
      onChangeText={setText}
      maxLength={ASSISTANT_TEXT_MAX}
      editable={!saving}
      accessibilityLabel="Edit your message"
      cursorColorClassName="accent-primary"
      selectionColorClassName="accent-primary"
      onKeyPress={(event) => {
        if (pointer && enterPressed(event)) {
          event.preventDefault();
          save();
        } else if (event.nativeEvent.key === 'Escape') {
          stopEditing();
        }
      }}
      className="max-h-48 min-h-touch-min resize-none px-1 font-sans text-body text-on-surface outline-none"
    />
  );
}

export function EditBubble({
  row,
  hasReply,
}: {
  readonly row: AssistantMessageRow;
  readonly hasReply: boolean;
}): ReactNode {
  const [text, setText] = useState(row.text);
  const { saving, save } = useSave(row, text);
  return (
    <View className="w-full gap-2 rounded-xl bg-primary-container p-3">
      <EditField text={text} setText={setText} saving={saving} save={save} />
      {hasReply ? (
        <Text variant="footnote" tone="variant">
          Saving sends it again and replaces the reply below.
        </Text>
      ) : null}
      <View className="flex-row justify-end gap-2">
        <Button label="Cancel" variant="text" onPress={stopEditing} />
        <Button
          label="Save"
          variant="filled"
          disabled={text.trim() === ''}
          loading={saving}
          onPress={save}
        />
      </View>
    </View>
  );
}
