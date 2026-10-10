import {
  ADGUARD_SNAPSHOT,
  QUERY_LOG_PAGE,
  type AdGuardQuery,
  type AdGuardSnapshot,
  type AdGuardStatus,
  type QueryLogFilter,
} from '@smarteverything/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { clock } from '../../format/time';
import { useDevices } from '../../store/selectors';
import type { Device } from '../../store/state';
import type { PluginNoticeText } from '../shared/plugin-notice';
import { usePluginStream, type PluginStream } from '../shared/use-plugin-stream';
import { usePluginTool, type PluginToolRunner } from '../use-plugin-tool';

export const ADGUARD_PLUGIN = 'adguard';

export function useAdGuardSnapshot(): PluginStream<AdGuardSnapshot> {
  return usePluginStream(ADGUARD_PLUGIN, 'adguard.snapshot', ADGUARD_SNAPSHOT);
}

export function useAdGuardTools(): PluginToolRunner {
  return usePluginTool(ADGUARD_PLUGIN);
}

export function useAdGuardDevice(): Device | null {
  return useDevices({ includeHidden: true }).find((device) => device.kind === 'dns_filter') ?? null;
}

export function protectionText(status: AdGuardStatus): string {
  if (status.protection) {
    return 'Ad blocking is on';
  }
  return status.pausedUntil === null
    ? 'Ad blocking is off'
    : `Ad blocking is paused until ${clock(status.pausedUntil)}`;
}

const NOTICES: Readonly<
  Record<'not_set_up' | 'sign_in_needed' | 'connecting' | 'paused', PluginNoticeText>
> = {
  not_set_up: {
    tone: 'info',
    title: 'AdGuard Home isn’t set up',
    body: 'Add its address, user name and password, or copy them from Router Monitor.',
    settings: true,
  },
  sign_in_needed: {
    tone: 'warning',
    title: 'Add the AdGuard Home sign-in',
    body: 'AdGuard Home needs its user name and password before it can be read.',
    settings: true,
  },
  connecting: {
    tone: 'info',
    title: 'Connecting to AdGuard Home…',
    body: 'This takes a few seconds.',
    settings: false,
  },
  paused: {
    tone: 'warning',
    title: 'Monitoring is paused',
    body: 'Nothing is read from AdGuard Home.',
    settings: true,
  },
};

export function adguardNotice(snapshot: AdGuardSnapshot): PluginNoticeText | null {
  const connection = snapshot.connection;
  switch (connection.state) {
    case 'online':
      return null;
    case 'refused':
      return {
        tone: 'critical',
        title: 'AdGuard Home refused the sign-in',
        body: 'Check the user name and password in the plugin settings.',
        settings: true,
      };
    case 'unreachable':
      return {
        tone: 'critical',
        title: 'AdGuard Home can’t be reached',
        body: connection.reason,
        settings: true,
      };
    case 'not_set_up':
    case 'sign_in_needed':
    case 'connecting':
    case 'paused':
      return NOTICES[connection.state];
  }
}

const PAGE_REPLY = z.strictObject({ page: QUERY_LOG_PAGE });

const MAX_LOADED_QUERIES = 300;

export interface QueryLogView {
  readonly entries: readonly AdGuardQuery[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly more: boolean;
  readonly loadOlder: () => void;
  readonly reload: () => void;
}

interface LogState {
  readonly key: string;
  readonly entries: readonly AdGuardQuery[];
  readonly olderThan: string | null;
  readonly loading: boolean;
  readonly failed: boolean;
}

function startOf(key: string): LogState {
  return { key, entries: [], olderThan: null, loading: true, failed: false };
}

export function useQueryLog(search: string, filter: QueryLogFilter): QueryLogView {
  const tools = useAdGuardTools();
  const [generation, setGeneration] = useState(0);
  const key = `${filter}|${String(generation)}|${search}`;
  const [state, setState] = useState<LogState>(() => startOf(key));
  const latest = useRef(key);
  const fetchPage = useCallback(
    async (olderThan: string | null, previous: readonly AdGuardQuery[]): Promise<LogState> => {
      const result = await tools.run('query_log', { search, filter, olderThan, limit: 50 });
      const parsed = PAGE_REPLY.safeParse(result);
      return parsed.success
        ? {
            key,
            entries: [...previous, ...parsed.data.page.entries],
            olderThan: parsed.data.page.olderThan,
            loading: false,
            failed: false,
          }
        : { key, entries: previous, olderThan, loading: false, failed: true };
    },
    [tools, search, filter, key],
  );
  const accept = useCallback((next: LogState): void => {
    if (next.key === latest.current) {
      setState(next);
    }
  }, []);
  useEffect(() => {
    latest.current = key;
    void fetchPage(null, []).then(accept);
  }, [fetchPage, accept, key]);
  const current = state.key === key ? state : startOf(key);
  return {
    entries: current.entries,
    loading: current.loading,
    failed: current.failed,
    more: current.olderThan !== null && current.entries.length < MAX_LOADED_QUERIES,
    loadOlder: (): void => {
      if (!current.loading && current.olderThan !== null) {
        setState({ ...current, loading: true });
        void fetchPage(current.olderThan, current.entries).then(accept);
      }
    },
    reload: (): void => {
      setGeneration((value) => value + 1);
    },
  };
}
