import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View, type TextInputSelectionChangeEvent } from 'react-native';
import { Button } from '../../../components/button';
import { copyText } from '../../../components/copy-button';
import { Sheet, type SheetProps } from '../../../components/sheet';
import { useColour } from '../../../design/colour';

interface Selected {
  readonly start: number;
  readonly end: number;
}

const NONE: Selected = { start: 0, end: 0 };

export function selectedExcerpt(text: string, selected: Selected): string {
  return text.slice(Math.min(selected.start, selected.end), Math.max(selected.start, selected.end));
}

function Footer({
  text,
  excerpt,
  onSelectAll,
  onAsk,
}: {
  readonly text: string;
  readonly excerpt: string;
  readonly onSelectAll: () => void;
  readonly onAsk: (excerpt: string) => void;
}): ReactNode {
  if (excerpt === '') {
    return (
      <View className="flex-row justify-end gap-2 px-4 pb-3">
        <Button label="Select all" variant="text" onPress={onSelectAll} />
        <Button
          label="Copy all"
          variant="tonal"
          onPress={() => {
            copyText(text, 'Message');
          }}
        />
      </View>
    );
  }
  return (
    <View className="flex-row justify-end gap-2 px-4 pb-3">
      <Button
        label="Ask about this"
        variant="text"
        onPress={() => {
          onAsk(excerpt);
        }}
      />
      <Button
        label="Copy"
        variant="tonal"
        onPress={() => {
          copyText(excerpt, 'Selection');
        }}
      />
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
      className="p-0 font-sans text-body text-on-surface"
    />
  );
}

interface SelectTextSheetProps {
  readonly text: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAsk: (excerpt: string) => void;
  readonly onComplete?: () => void;
  readonly subpage?: SheetProps['subpage'];
}

export function SelectTextSheet({
  text,
  open,
  onClose,
  onAsk,
  onComplete = onClose,
  subpage,
}: SelectTextSheetProps): ReactNode {
  const [selected, setSelected] = useState<Selected>(NONE);
  const [forced, setForced] = useState<Selected | null>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Select text"
      subpage={subpage}
      detents={['half', 'full']}
      footer={
        <Footer
          text={text}
          excerpt={selectedExcerpt(text, selected)}
          onSelectAll={() => {
            setForced({ start: 0, end: text.length });
          }}
          onAsk={(excerpt) => {
            onAsk(excerpt);
            onComplete();
          }}
        />
      }
    >
      <View className="pb-2">
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
