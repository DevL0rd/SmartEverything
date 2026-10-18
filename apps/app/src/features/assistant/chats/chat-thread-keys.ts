import { router } from 'expo-router';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
import { copyText } from '../../../components/copy-button';
import { useMemo } from 'react';
import { useMinute } from '../../../store/clock';
import { useStoreSelector } from '../../../store/store-context';
import { useChatEntries } from '../data/chat-store';
import { latestReplyText } from '../model/latest-reply';
import { sectionsOf } from './chat-entry';
import { NEW_CHAT_ID } from './draft-thread';
import type { PanelState } from './chat-panel-state';
import { toggleChatList } from './chat-list-toggle';

function neighbour(ids: readonly string[], current: string, step: number): string | null {
  const index = ids.indexOf(current);
  return index === -1 ? null : (ids[index + step] ?? null);
}

function useListOrder(): readonly string[] {
  const entries = useChatEntries();
  const now = useMinute();
  const zone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  return useMemo(
    () =>
      sectionsOf(entries, entries, { now, timeZone: zone }).flatMap((section) =>
        section.data.map((item) => item.entry.id),
      ),
    [entries, now, zone],
  );
}

export function useThreadKeys(
  chatId: string,
  rows: readonly AssistantMessageRow[],
  panel: PanelState,
  active = true,
): void {
  const ids = useListOrder();
  useKeyboard((press: KeyPress) => {
    const key = press.key.toLowerCase();
    if (closeBrowser(key, panel)) return true;
    if (press.command && press.shift) {
      return shiftedKey(key, rows);
    }
    if (press.command) {
      return commandKey(key, panel);
    }
    if (press.alt && (press.key === 'ArrowUp' || press.key === 'ArrowDown')) {
      const next = neighbour(ids, chatId, press.key === 'ArrowUp' ? -1 : 1);
      if (next !== null) {
        router.navigate(href.assistantChat(next));
      }
      return true;
    }
    return false;
  }, active);
}

function shiftedKey(key: string, rows: readonly AssistantMessageRow[]): boolean {
  if (key === 'o') {
    router.navigate(href.assistantChat(NEW_CHAT_ID));
    return true;
  }
  if (key === 'd') {
    router.setParams({ sheet: 'chat' });
    return true;
  }
  const reply = latestReplyText(rows);
  if (key === 'c' && reply !== null) {
    copyText(reply, 'Reply');
    return true;
  }
  return false;
}

function commandKey(key: string, panel: PanelState): boolean {
  if (key === 'i') {
    panel.toggle();
    return true;
  }
  if (key === '\\') {
    toggleChatList();
    return true;
  }
  return false;
}

function closeBrowser(key: string, panel: PanelState): boolean {
  if (key !== 'escape' || !panel.open) return false;
  panel.hide();
  return true;
}
