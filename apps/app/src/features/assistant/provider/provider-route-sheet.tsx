import { isComputerEngine } from './computer-engine';
import type { ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { ProviderWorkSheet } from './runtime-work-sheet';
import { WORK_TABS } from './work-tabs';
import { EngineSheet } from '../chats/model-chip';
import { useChatEngineChange } from '../chats/chat-engine-change';

export function ProviderRouteSheet({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const { work, operation } = useLocalSearchParams<{ work?: string; operation?: string }>();
  const change = useChatEngineChange(chat);
  const tab = WORK_TABS.find((row) => row.value === work)?.value;
  if ((!isComputerEngine(chat.engine) && chat.engine.kind !== 'dsh') || tab === undefined)
    return null;
  const close = (): void => {
    router.setParams({ work: undefined, operation: undefined });
  };
  if (chat.engine.kind === 'dsh' && operation === 'device') return null;
  if (chat.engine.kind === 'dsh' && operation === 'model')
    return <EngineSheet open engine={chat.engine} onChange={change} onClose={close} />;
  return (
    <ProviderWorkSheet
      chat={chat}
      open
      initial={tab}
      {...(operation === undefined ? {} : { operation })}
      onClose={close}
    />
  );
}
