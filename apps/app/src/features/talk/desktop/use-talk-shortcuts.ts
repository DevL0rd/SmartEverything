import type { DesktopTalkShortcuts } from '@smarteverything/domain';
import { ValueStore, useValue } from '../../../design/external-store';
import { desktopBridge } from '../../../design/platform';

export type DesktopTalkStatus =
  | { readonly status: 'none' }
  | { readonly status: 'outdated' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly shortcuts: DesktopTalkShortcuts }
  | { readonly status: 'failed'; readonly reason: string };

export const desktopTalk = new ValueStore<DesktopTalkStatus>({ status: 'none' });

export function useDesktopTalk(): DesktopTalkStatus {
  return useValue(desktopTalk);
}

export function useTalkShortcutLabel(): string | null {
  const desktop = useDesktopTalk();
  return desktop.status === 'ready' ? desktop.shortcuts.talk : null;
}

function show(answer: Promise<DesktopTalkShortcuts>): void {
  desktopTalk.set({ status: 'loading' });
  answer.then(
    (shortcuts) => {
      desktopTalk.set({ status: 'ready', shortcuts });
    },
    (error: unknown) => {
      desktopTalk.set({
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    },
  );
}

export function loadDesktopTalk(): void {
  const bridge = desktopBridge();
  if (bridge === null) {
    return;
  }
  if (bridge.talkShortcuts === undefined) {
    desktopTalk.set({ status: 'outdated' });
    return;
  }
  show(bridge.talkShortcuts());
}

export function configureDesktopTalk(): void {
  const bridge = desktopBridge();
  if (bridge?.configureTalkShortcuts === undefined) {
    return;
  }
  show(bridge.configureTalkShortcuts());
}
