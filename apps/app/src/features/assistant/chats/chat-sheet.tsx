import { HarnessWorkButton } from '../provider/harness-work';
import { useProviderWorking } from '../provider/provider-working';
import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { BottomSheet } from '../../../components/bottom-sheet';
import { useChatEngineChange } from './chat-engine-change';
import { BranchRows, FileRows, InfoRows } from './chat-sheet-rows';
import { QuickActions, SheetHeading } from './chat-sheet-parts';
import { ChatToolsSheet } from './chat-tools-sheet';
import { ProviderWorkButton } from '../provider/runtime-work-sheet';
import { EngineSheet } from './model-chip';
import { AgentChatInfo } from '../components/agent-chat-info';
import { LaunchAgent } from '../components/launch-agent';

export interface ChatSheetProps {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}

type Inner = 'model' | 'tools' | null;

function SheetBody({ chat, rows, onClose, onDeleted }: ChatSheetProps): ReactNode {
  const [inner, setInner] = useState<Inner>(null);
  const working = useProviderWorking(chat);
  const change = useChatEngineChange(chat);
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
      <AgentChatInfo chat={chat} onDeleted={onDeleted} />
      <LaunchAgent chat={chat} />
      {chat.engine.kind === 'dsh' ? (
        <HarnessWorkButton chat={chat} />
      ) : (
        <ProviderWorkButton chat={chat} />
      )}
      <EngineSheet
        open={inner === 'model'}
        onClose={() => {
          setInner(null);
        }}
        engine={chat.engine}
        blocked={isComputerEngine(chat.engine) && working}
        onChange={change}
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
  return (
    <BottomSheet open={open} onClose={body.onClose} label="Chat" detents={['half', 'full']}>
      {open ? <SheetBody {...body} /> : null}
    </BottomSheet>
  );
}
