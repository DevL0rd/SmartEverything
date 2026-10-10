import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useNavigationContainerRef, useSegments } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { rememberScreen, sinkOf } from './sink';

const GROUP = /^\(.*\)$/;

function useScreenReports(): void {
  const segments = useSegments();
  const screen = segments.filter((segment) => !GROUP.test(segment)).join('/') || 'home';
  useEffect(() => {
    rememberScreen(screen);
    sinkOf()?.screen(screen);
  }, [screen]);
}

function useNavigationActions(): void {
  const navigation = useNavigationContainerRef();
  useEffect(
    () =>
      navigation.addListener('__unsafe_action__', (event) => {
        sinkOf()?.action('nav', event.data.action.type);
      }),
    [navigation],
  );
}

function useQueryActions(): void {
  const cache = useQueryClient().getQueryCache();
  useEffect(
    () =>
      cache.subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'success') {
          sinkOf()?.action('query', event.query.queryHash.slice(0, 24));
        }
      }),
    [cache],
  );
}

export function PerfHost(): ReactNode {
  useScreenReports();
  useNavigationActions();
  useQueryActions();
  return null;
}
