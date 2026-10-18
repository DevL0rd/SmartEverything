import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { AiChatRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { useDevice } from '../../../store/selectors';
import { useChatHarness, useHarnessCatalogue, harnessKey } from '../data/harness';
import { harnessHostName, harnessRouteLabel } from '../model/harness-context';
import {
  harnessFailureCopy,
  type HarnessFailureAction,
  type HarnessFailureCopy,
} from './harness-failure';
import { useMoment } from './use-moment';
import { background } from '@smarteverything/logging';

export function useHarnessFailure(chat: AiChatRow): HarnessFailureCopy | null {
  const engine = chat.engine;
  const session = useChatHarness(chat.id, engine.kind === 'dsh' && engine.session_id !== null).data;
  const catalogue = useHarnessCatalogue().data;
  const when = useMoment();
  if (!session?.failure) return null;
  const route = catalogue?.routes.find((row) => row.id === session.route.route_id);
  return harnessFailureCopy(session.failure, {
    machine: harnessHostName(session.target, catalogue),
    route: route === undefined ? null : harnessRouteLabel(route, catalogue),
    folder: session.directory?.path ?? null,
    reset: when,
  });
}

export function useFailureHandlers(
  chat: AiChatRow,
  before?: () => void,
): (action: HarnessFailureAction) => (() => void) | null {
  const client = useQueryClient();
  const target = chat.engine.kind === 'dsh' ? chat.engine.execution_target : null;
  const device = useDevice(target?.kind === 'device' ? target.device_id : '');
  return (action) => {
    switch (action) {
      case 'open_computer':
        return device === null
          ? null
          : (): void => {
              before?.();
              router.push(href.device(device));
            };
      case 'choose_model':
        return (): void => {
          before?.();
          router.setParams({ operation: 'model' });
        };
      case 'choose_folder':
        return (): void => {
          before?.();
          router.setParams({ operation: 'device' });
        };
      case 'check_status':
        return (): void => {
          background(
            client.refetchQueries({ queryKey: harnessKey(chat.id) }),
            'queries.refetch_failed',
          );
        };
    }
  };
}
