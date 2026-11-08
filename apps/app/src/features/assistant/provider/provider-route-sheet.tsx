import type { ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { ProviderWorkSheet } from './runtime-work-sheet';
import { WORK_TABS } from './work-tabs';
import { modelPanelPage } from '../picker/panel/panel-state';

export function ProviderRouteSheet({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const { work, operation } = useLocalSearchParams<{ work?: string; operation?: string }>();
  const tab = WORK_TABS.find((row) => row.value === work)?.value;
  if (tab === undefined) return null;
  const close = (): void => {
    router.setParams({ work: undefined, operation: undefined });
  };
  if (modelPanelPage(operation, work, chat.engine.kind) !== null) return null;
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
