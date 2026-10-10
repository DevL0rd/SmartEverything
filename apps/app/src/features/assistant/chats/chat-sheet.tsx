import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { DialogFrame } from '../../../components/dialog-frame';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { changeChat } from './chat-actions';
import { BranchRows, FileRows, InfoRows } from './chat-sheet-rows';
import { QuickActions, SheetHeading } from './chat-sheet-parts';
import { ChatToolsSheet } from './chat-tools-sheet';
import { EngineSheet } from './model-chip';

export interface ChatSheetProps {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}

type Inner = 'model' | 'tools' | null;

function SheetBody({ chat, rows, onClose, onDeleted }: ChatSheetProps): ReactNode {
  const [inner, setInner] = useState<Inner>(null);
  return (
    <View className="gap-section-gap">
      <View>
        <SheetHeading chat={chat} />
        <QuickActions chat={chat} rows={rows} onClose={onClose} onDeleted={onDeleted} />
      </View>
      <InfoRows
        chat={chat}
        rows={rows}
        onModel={() => {
          setInner('model');
        }}
        onTools={() => {
          setInner('tools');
        }}
      />
      <BranchRows chatId={chat.id} />
      <FileRows rows={rows} />
      <EngineSheet
        open={inner === 'model'}
        onClose={() => {
          setInner(null);
        }}
        engine={chat.engine}
        onChange={(engine) => {
          void changeChat(chat.id, { engine });
        }}
      />
      <ChatToolsSheet
        chat={chat}
        open={inner === 'tools'}
        onClose={() => {
          setInner(null);
        }}
      />
    </View>
  );
}

export function ChatSheet({
  open,
  ...body
}: ChatSheetProps & { readonly open: boolean }): ReactNode {
  const touch = useIdiom() === 'touch';
  const split = useSizeClass().split;
  const content = open ? <SheetBody {...body} /> : null;
  if (touch && split) {
    return (
      <DialogFrame open={open} onClose={body.onClose} label="Chat" title="Chat" kind="inspector">
        {content}
      </DialogFrame>
    );
  }
  return (
    <Sheet
      open={open}
      onClose={body.onClose}
      label="Chat"
      {...(touch ? {} : { title: 'Chat' })}
      kind="inspector"
      detents={['half', 'full']}
    >
      {content}
    </Sheet>
  );
}

export function ChatPanel(props: ChatSheetProps): ReactNode {
  return (
    <View
      accessibilityLabel="Chat"
      className="h-full w-inspector max-w-full border-l border-outline-variant bg-surface-1"
    >
      <View className="min-h-touch-min flex-row items-center gap-2 pl-6 pr-2 pt-safe">
        <Text variant="title-3" accessibilityRole="header" className="flex-1">
          Chat
        </Text>
        <IconButton icon="close" label="Close" onPress={props.onClose} shortcut="Ctrl I" />
      </View>
      <ScrollView contentContainerClassName="px-6 pb-6 pt-2">
        <SheetBody {...props} />
      </ScrollView>
    </View>
  );
}
