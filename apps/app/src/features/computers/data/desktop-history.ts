import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { ClaudeSession, ComputerAiStatus } from '@smarteverything/domain';
import { rawErrorText } from '../../../format/errors';
import { useScreenPaused } from '../../../design/screen-pause';
import {
  computerAiKey,
  nativeSessionsKey,
  readComputerAi,
  readNativeSessions,
} from './computer-ai';

export interface DesktopHistoryTarget {
  readonly deviceId: string;
  readonly name: string;
}

export type DesktopHistoryComputer =
  | (DesktopHistoryTarget & { readonly history: 'loading' | 'off' | 'offline' })
  | (DesktopHistoryTarget & { readonly history: 'failed'; readonly reason: string })
  | (DesktopHistoryTarget & {
      readonly history: 'ready';
      readonly sessions: readonly ClaudeSession[];
    });

export interface SessionRead {
  readonly sessions: readonly ClaudeSession[] | undefined;
  readonly failure: string | null;
}

const NO_READ: SessionRead = { sessions: undefined, failure: null };

export function desktopHistoryOf(
  target: DesktopHistoryTarget,
  status: HistoryStatus,
  read: SessionRead,
): DesktopHistoryComputer {
  if (status === undefined) return { ...target, history: 'loading' };
  if (!status.historyOn) return { ...target, history: 'off' };
  if (!status.online) return { ...target, history: 'offline' };
  if (read.sessions !== undefined) return { ...target, history: 'ready', sessions: read.sessions };
  return read.failure === null
    ? { ...target, history: 'loading' }
    : { ...target, history: 'failed', reason: read.failure };
}

type HistoryStatus = { readonly online: boolean; readonly historyOn: boolean } | undefined;

export function useDesktopHistory(
  targets: readonly DesktopHistoryTarget[],
  enabled: boolean,
): readonly DesktopHistoryComputer[] {
  const paused = useScreenPaused();
  const statuses = useQueries({
    queries: targets.map((target) => ({
      queryKey: [...computerAiKey(target.deviceId), 'status'],
      queryFn: (): Promise<ComputerAiStatus> => readComputerAi(target.deviceId),
      enabled,
      subscribed: !paused,
    })),
    combine: (results): readonly HistoryStatus[] =>
      results.map((result) =>
        result.data === undefined
          ? undefined
          : { online: result.data.online, historyOn: result.data.settings.control.enabled },
      ),
  });
  const lists = useQueries({
    queries: targets.map((target, at) => {
      const status = statuses[at];
      return {
        queryKey: nativeSessionsKey(target.deviceId, false),
        queryFn: (): Promise<ClaudeSession[]> => readNativeSessions(target.deviceId, false),
        enabled: enabled && status?.online === true && status.historyOn,
        subscribed: !paused,
      };
    }),
    combine: (results): readonly SessionRead[] =>
      results.map((result) => ({
        sessions: result.data,
        failure: result.isError ? rawErrorText(result.error) : null,
      })),
  });
  return useMemo(
    () => targets.map((target, at) => desktopHistoryOf(target, statuses[at], lists[at] ?? NO_READ)),
    [targets, statuses, lists],
  );
}
