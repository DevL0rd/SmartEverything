import { useCallback, useState } from 'react';
import { background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { notify, type ToastInput } from '../../../components/toast-store';
import { useIsOwner } from '../../../store/selectors';
import { forkDesktopSession } from '../../computers';
import { useAiChats } from '../data/chat-store';
import { useEngineCatalogue } from '../provider/provider-data';
import type { ChatEntry, DesktopRef } from './chat-entry';

export interface DesktopOpenDeps {
  readonly linkedChat: (desktop: DesktopRef) => string | undefined;
  readonly confirm: typeof confirm;
  readonly fork: (desktop: DesktopRef) => Promise<string>;
  readonly open: (chatId: string) => void;
  readonly notify: (toast: ToastInput) => unknown;
  readonly busy: (entryId: string | null) => void;
}

export async function openDesktopEntry(deps: DesktopOpenDeps, entry: ChatEntry): Promise<void> {
  const desktop = entry.desktop;
  if (desktop === undefined) return;
  const linked = deps.linkedChat(desktop);
  if (linked !== undefined) {
    deps.open(linked);
    return;
  }
  if (await confirmed(deps, entry)) await forkAndOpen(deps, entry, desktop);
}

async function confirmed(deps: DesktopOpenDeps, entry: ChatEntry): Promise<boolean> {
  deps.busy(entry.id);
  try {
    return await deps.confirm({
      title: 'Fork and open in the app?',
      body: 'This copies the Desktop chat into a new app chat. The original stays untouched.',
      confirmLabel: 'Fork and open',
    });
  } finally {
    deps.busy(null);
  }
}

async function forkAndOpen(
  deps: DesktopOpenDeps,
  entry: ChatEntry,
  desktop: DesktopRef,
): Promise<void> {
  deps.busy(entry.id);
  try {
    deps.open(await deps.fork(desktop));
  } catch (error) {
    deps.notify({
      message: 'Couldn’t open the Desktop chat',
      ...(error instanceof Error ? { detail: error.message } : {}),
      tone: 'critical',
      action: {
        label: 'Retry',
        onPress: () => {
          background(forkAndOpen(deps, entry, desktop), 'desktop.open_retry_failed');
        },
      },
    });
  } finally {
    deps.busy(null);
  }
}

export function useOpenDesktop(onOpen: (chatId: string) => void): {
  readonly busyId: string | null;
  readonly openDesktop: (entry: ChatEntry) => void;
} {
  const owner = useIsOwner();
  const chats = useAiChats();
  const preferences = useEngineCatalogue().data?.preferences;
  const [busyId, setBusyId] = useState<string | null>(null);
  const openDesktop = useCallback(
    (entry: ChatEntry): void => {
      if (busyId !== null) return;
      const deps: DesktopOpenDeps = {
        linkedChat: (desktop) =>
          chats.find(
            (chat) =>
              chat.engine.kind === 'claude' &&
              chat.engine.device_id === desktop.deviceId &&
              chat.engine.continued_from === desktop.session.id,
          )?.id,
        confirm,
        fork: (desktop) =>
          forkDesktopSession({
            deviceId: desktop.deviceId,
            session: desktop.session,
            owner,
            preferredModel: preferences?.find(
              (row) => row.runtime === 'claude' && row.device_id === desktop.deviceId,
            )?.model,
          }),
        open: onOpen,
        notify,
        busy: setBusyId,
      };
      background(openDesktopEntry(deps, entry), 'desktop.open_failed');
    },
    [busyId, chats, owner, onOpen, preferences],
  );
  return { busyId, openDesktop };
}
