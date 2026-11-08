import { useState, type ReactNode } from 'react';
import type { AiChatRow } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { HarnessWorkSheet } from './harness-work';
import { ClaudeWorkSheet } from './provider-work-sheet';
import { CodexWorkSheet } from './codex-work-sheet';
import { COMPUTER_ENGINE_LABELS, isComputerEngine } from './computer-engine';
import type { WorkTab } from './work-tabs';
interface Props {
  readonly chat: AiChatRow;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly initial?: WorkTab;
  readonly operation?: string;
}
export function ProviderWorkSheet(props: Props): ReactNode {
  switch (props.chat.engine.kind) {
    case 'dsh':
      return <HarnessWorkSheet {...props} />;
    case 'claude':
      return <ClaudeWorkSheet {...props} />;
    case 'codex':
      return <CodexWorkSheet {...props} />;
  }
}
export function ProviderWorkButton({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const [open, change] = useState(false);
  if (!isComputerEngine(chat.engine)) return null;
  return (
    <>
      <IconButton
        icon="wrench"
        label={`${COMPUTER_ENGINE_LABELS[chat.engine.kind].name} commands, tools and work settings`}
        onPress={() => {
          change(true);
        }}
      />
      <ProviderWorkSheet
        chat={chat}
        open={open}
        onClose={() => {
          change(false);
        }}
      />
    </>
  );
}
