import { skipToken, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DesktopTalkShortcuts } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { desktopBridge, type DesktopBridge } from '../../../design/platform';
import { rawErrorText } from '../../../format/errors';
import { useScreenQuery } from '../../../queries/use-screen-query';

export type DesktopTalkStatus =
  | { readonly status: 'none' }
  | { readonly status: 'outdated' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly shortcuts: DesktopTalkShortcuts }
  | { readonly status: 'failed'; readonly reason: string };

const log = new Logger('app.talk');

const TALK_SHORTCUTS_KEY = ['desktop', 'talk-shortcuts'] as const;

export function desktopTalkStatusOf(
  bridge: Pick<DesktopBridge, 'talkShortcuts'> | null,
  shortcuts: DesktopTalkShortcuts | undefined,
  error: Error | null,
): DesktopTalkStatus {
  if (bridge === null) {
    return { status: 'none' };
  }
  if (bridge.talkShortcuts === undefined) {
    return { status: 'outdated' };
  }
  if (shortcuts !== undefined) {
    return { status: 'ready', shortcuts };
  }
  return error === null ? { status: 'loading' } : { status: 'failed', reason: rawErrorText(error) };
}

export function useDesktopTalk(): DesktopTalkStatus {
  const bridge = desktopBridge();
  const read = bridge?.talkShortcuts?.bind(bridge);
  const query = useScreenQuery({
    queryKey: TALK_SHORTCUTS_KEY,
    queryFn: read ?? skipToken,
    retry: false,
  });
  return desktopTalkStatusOf(bridge, query.data, query.error);
}

export function useTalkShortcutLabel(): string | null {
  const desktop = useDesktopTalk();
  return desktop.status === 'ready' ? desktop.shortcuts.talk : null;
}

export function useConfigureDesktopTalk(): () => void {
  const client = useQueryClient();
  const bridge = desktopBridge();
  const configure = bridge?.configureTalkShortcuts?.bind(bridge);
  const mutation = useMutation({
    mutationFn: async (): Promise<DesktopTalkShortcuts> => {
      if (configure === undefined) {
        throw new Error('This desktop app cannot change the shortcuts yet.');
      }
      return configure();
    },
    onSuccess: (shortcuts): void => {
      client.setQueryData(TALK_SHORTCUTS_KEY, shortcuts);
    },
    onError: (error): void => {
      log.warn('talk.shortcuts_failed', { error: error.name });
      notify({ message: 'The shortcuts were not changed', error, tone: 'critical' });
    },
  });
  return (): void => {
    mutation.mutate();
  };
}
