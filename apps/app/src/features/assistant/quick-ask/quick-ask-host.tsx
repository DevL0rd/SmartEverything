import type { ReactNode } from 'react';
import { useState } from 'react';
import { ValueStore, useValue } from '../../../design/external-store';
import { useActiveProfile } from '../../../store/people';
import { appChatHistoryOnly } from '../chats/chat-visibility';
import { useAiChats } from '../data/chat-store';
import { setDraft } from '../data/drafts';
import { ContinueComposer, NewChatComposer, QUICK_ASK_DRAFT_KEY } from './quick-ask-composers';
import { useQuickAskDelivery } from './quick-ask-delivery';
import { QuickAskFrame } from './quick-ask-frame';
import { chosenTarget, continueLabel, latestChat, type QuickAskChoice } from './quick-ask-model';
import { TargetLine } from './quick-ask-target-line';

const open = new ValueStore(false);

export function openQuickAsk(): void {
  open.set(true);
}

export function openQuickAskWith(text: string): void {
  setDraft(QUICK_ASK_DRAFT_KEY, text);
  open.set(true);
}

function close(): void {
  open.set(false);
}

function QuickAskDialog(): ReactNode {
  const profile = useActiveProfile();
  const latest = latestChat(
    useAiChats().filter((chat) => !appChatHistoryOnly(chat)),
    profile?.id ?? null,
  );
  const [now] = useState(Date.now);
  const [picked, setPicked] = useState<QuickAskChoice | null>(null);
  const delivery = useQuickAskDelivery();
  const target = chosenTarget(picked, latest !== null);
  return (
    <QuickAskFrame onClose={close}>
      <TargetLine
        value={target}
        continueLabel={latest === null ? null : continueLabel(latest, now)}
        onChange={setPicked}
      />
      {target === 'continue' && latest !== null ? (
        <ContinueComposer chat={latest} delivery={delivery} close={close} />
      ) : (
        <NewChatComposer delivery={delivery} close={close} />
      )}
    </QuickAskFrame>
  );
}

export function QuickAskHost(): ReactNode {
  return useValue(open) ? <QuickAskDialog /> : null;
}
