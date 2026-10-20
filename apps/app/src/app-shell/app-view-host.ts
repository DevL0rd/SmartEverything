import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { API_ENDPOINTS as E, type AppViewRequest } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { api } from '../api/transport';
import { highlights } from '../components/highlight-anchors';
import { onAppView } from '../store/app-view-requests';
import type { EntityStore } from '../store/entity-store';
import { useEntityStore } from '../store/store-context';
import { appViewResult } from './app-view';

const log = new Logger('app.nav');

async function answer(request: AppViewRequest, store: EntityStore): Promise<void> {
  const result = await appViewResult(request, {
    inFront: () => AppState.currentState === 'active',
    state: () => store.get(),
    navigate: (target) => {
      router.navigate(target);
    },
    highlight: { present: highlights.present, show: highlights.request, clear: highlights.clear },
  });
  log.info('app_view.handled', {
    action: request.action,
    ok: result.ok,
    highlighted: result.ok && result.highlighted,
  });
  await api().call(E.answerAppView, { body: { requestId: request.requestId, result } });
}

export function AppViewHost(): null {
  const store = useEntityStore();
  useEffect(
    () =>
      onAppView((request) => {
        background(answer(request, store), 'app_view.answer_failed', { action: request.action });
      }),
    [store],
  );
  return null;
}
