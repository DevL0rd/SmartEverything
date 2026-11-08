import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View, type TextInputKeyPressEvent } from 'react-native';
import { type AssistantMessageRow, type AiMessageReference } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { stopEditing } from '../data/editing';
import { adjustedReferences } from '../references/spans';
import { editMessage } from '../data/send';
import type { RunPosition } from '../model/speaker';
import { background } from '@smarteverything/logging';
import { MetaAction, MetaDot, OWN_META_LINE, ownBubbleClass } from './message-parts';

const EDIT_FRAME = 'min-w-55 border border-primary px-3 py-1.75';

function enterPressed(event: TextInputKeyPressEvent): boolean {
  const native = event.nativeEvent;
  const shift = 'shiftKey' in native && native.shiftKey === true;
  return native.key === 'Enter' && !shift;
}

function useSave(
  row: AssistantMessageRow,
  text: string,
  references: readonly AiMessageReference[],
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
      background(
        editMessage(row, text, references).then((saved) => {
          setSaving(false);
          if (saved) {
            stopEditing();
          }
        }),
        'message.edit_failed',
      );
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
      className="max-h-48 resize-none p-0 font-sans text-body text-on-surface web:outline-none"
    />
  );
}

function EditActions({
  hasReply,
  saving,
  canSave,
  save,
}: {
  readonly hasReply: boolean;
  readonly saving: boolean;
  readonly canSave: boolean;
  readonly save: () => void;
}): ReactNode {
  return (
    <View className={OWN_META_LINE}>
      {hasReply ? (
        <>
          <Text variant="caption" tone="faint" numberOfLines={1} className="min-w-0 shrink">
            Resends and replaces the reply
          </Text>
          <MetaDot />
        </>
      ) : null}
      <MetaAction text="Cancel" onPress={stopEditing} />
      <MetaDot />
      <MetaAction
        text={saving ? 'Saving' : 'Save'}
        primary
        disabled={saving || !canSave}
        onPress={save}
      />
    </View>
  );
}

export function EditBubble({
  row,
  position,
  hasReply,
}: {
  readonly row: AssistantMessageRow;
  readonly position: RunPosition;
  readonly hasReply: boolean;
}): ReactNode {
  const [draft, setDraft] = useState({ text: row.text, references: row.references ?? [] });
  const { text, references } = draft;
  const setText = (next: string): void => {
    setDraft((before) => ({
      text: next,
      references: [...adjustedReferences(before.text, next, before.references)],
    }));
  };
  const { saving, save } = useSave(row, text, references);
  return (
    <>
      <View className={cn(ownBubbleClass(position), EDIT_FRAME)}>
        <EditField text={text} setText={setText} saving={saving} save={save} />
      </View>
      <EditActions hasReply={hasReply} saving={saving} canSave={text.trim() !== ''} save={save} />
    </>
  );
}
