import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View, type TextInputSelectionChangeEvent } from 'react-native';
import { Button } from '../../../components/button';
import { copyText } from '../../../components/copy-button';
import { Sheet } from '../../../components/sheet';
import { useColour } from '../../../design/colour';

interface Selected {
  readonly start: number;
  readonly end: number;
}

const NONE: Selected = { start: 0, end: 0 };

function SelectionBar({
  text,
  selected,
  onAsk,
}: {
  readonly text: string;
  readonly selected: Selected;
  readonly onAsk: (excerpt: string) => void;
}): ReactNode {
  const excerpt = text.slice(selected.start, selected.end);
  if (excerpt === '') {
    return null;
  }
  return (
    <View className="flex-row gap-1 self-start rounded-full bg-on-surface px-1">
      <Button
        label="Copy"
        variant="text"
        onPress={() => {
          copyText(excerpt, 'Selection');
        }}
      />
      <Button
        label="Ask about this"
        variant="text"
        onPress={() => {
          onAsk(excerpt);
        }}
      />
    </View>
  );
}

function Footer({
  onSelectAll,
  onCopyAll,
}: {
  readonly onSelectAll: () => void;
  readonly onCopyAll: () => void;
}): ReactNode {
  return (
    <View className="flex-row justify-end gap-2 px-4 pb-3">
      <Button label="Select all" variant="text" onPress={onSelectAll} />
      <Button label="Copy all" variant="tonal" onPress={onCopyAll} />
    </View>
  );
}

function Field({
  text,
  forced,
  onSelect,
}: {
  readonly text: string;
  readonly forced: Selected | null;
  readonly onSelect: (selected: Selected) => void;
}): ReactNode {
  const tint = useColour('primary');
  return (
    <TextInput
      multiline
      readOnly
      scrollEnabled={false}
      value={text}
      {...(forced === null ? {} : { selection: forced })}
      selectionColor={tint}
      accessibilityLabel="Message text"
      onSelectionChange={(event: TextInputSelectionChangeEvent) => {
        onSelect(event.nativeEvent.selection);
      }}
      className="rounded-lg border-hairline border-outline-variant p-3 font-sans text-body text-on-surface"
    />
  );
}

export function SelectTextSheet({
  text,
  open,
  onClose,
  onAsk,
}: {
  readonly text: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAsk: (excerpt: string) => void;
}): ReactNode {
  const [selected, setSelected] = useState<Selected>(NONE);
  const [forced, setForced] = useState<Selected | null>(null);
  const ask = (excerpt: string): void => {
    onAsk(excerpt);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Select text"
      detents={['half', 'full']}
      footer={
        <Footer
          onSelectAll={() => {
            setForced({ start: 0, end: text.length });
          }}
          onCopyAll={() => {
            copyText(text, 'Message');
          }}
        />
      }
    >
      <View className="gap-3 pb-2">
        <SelectionBar text={text} selected={selected} onAsk={ask} />
        <Field
          text={text}
          forced={forced}
          onSelect={(next) => {
            setSelected(next);
            setForced(null);
          }}
        />
      </View>
    </Sheet>
  );
}
