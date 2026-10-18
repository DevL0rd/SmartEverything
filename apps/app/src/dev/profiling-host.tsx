import type { ReactNode } from 'react';
import { Profiler, useEffect } from 'react';
import { useSegments } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useDeveloperFlags } from '../developer/flags';
import { allOff } from '../developer/toggles';
import { recordCommit } from './frame-probe';
import { setQueryReader, type QueryCounts } from './leak-probe';
import { reconcileProbes } from './profiling-suite';
import { markFirstCommit, markFirstRoute } from './startup-probe';
import { setScreen } from './window-bus';

const GROUP = /^\(.*\)$/;

function useRouteWindows(): void {
  const segments = useSegments();
  const screen = segments.filter((segment) => !GROUP.test(segment)).join('/') || 'home';
  useEffect(() => {
    markFirstRoute();
    setScreen(screen);
  }, [screen]);
}

function useQueryCounts(): void {
  const cache = useQueryClient().getQueryCache();
  useEffect(() => {
    setQueryReader((): QueryCounts => {
      const queries = cache.getAll();
      return {
        queries: queries.length,
        observers: queries.reduce((sum, query) => sum + query.getObserversCount(), 0),
        fetching: queries.filter((query) => query.state.fetchStatus === 'fetching').length,
      };
    });
    return (): void => {
      setQueryReader(null);
    };
  }, [cache]);
}

export function ProfilingHost(): ReactNode {
  const flags = useDeveloperFlags();
  useEffect(() => {
    reconcileProbes(flags);
  }, [flags]);
  useEffect(
    () => (): void => {
      reconcileProbes(allOff());
    },
    [],
  );
  useRouteWindows();
  useQueryCounts();
  return null;
}

export function RootProfiler({ children }: { readonly children: ReactNode }): ReactNode {
  if (!__DEV__) {
    return children;
  }
  return (
    <Profiler
      id="root"
      onRender={(_id, _phase, actualMs) => {
        markFirstCommit();
        recordCommit(actualMs);
      }}
    >
      {children}
    </Profiler>
  );
}
