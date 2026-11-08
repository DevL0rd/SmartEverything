import { use, useCallback, useRef, useState, type RefObject } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type AiRepairAdmission,
  type AiRepairDismissal,
  type AiRepairPage,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { href } from '../../../app-shell/hrefs';
import { ScreenPausedContext, useScreenPaused } from '../../../design/screen-pause';
import {
  captureAssistantWrite,
  type AssistantWriteScope,
} from '../../../store/assistant-response-style';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';
import { upsert } from '../../../store/table-ops';
import { RULES } from '../../../store/table-rules';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useSession } from '../../../store/selectors';

export const AI_REPAIR_GROUPS_KEY = ['developer', 'ai-repair-groups'] as const;
const REPAIR_GROUP_PAGE_SIZE = 5;

export function useAiRepairGroups(cursor: AiRepairPage['next']): UseQueryResult<AiRepairPage> {
  const { client } = useSession();
  return useScreenQuery({
    queryKey: [...AI_REPAIR_GROUPS_KEY, client.id, client.profile_id, cursor],
    queryFn: ({ signal }) =>
      api().call(
        E.listAiRepairGroups,
        { query: { ...cursor, limit: REPAIR_GROUP_PAGE_SIZE } },
        { signal },
      ),
  });
}

export function useDismissAiRepairGroups(): UseMutationResult<
  { readonly dismissed: number },
  Error,
  AiRepairDismissal
> {
  const queries = useQueryClient();
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: (body) => api().call(E.dismissAiRepairGroups, { body }),
    onSuccess: () => queries.invalidateQueries({ queryKey: AI_REPAIR_GROUPS_KEY }),
  });
}

export function useRefreshAiRepairGroups(): () => void {
  const queries = useQueryClient();
  return (): void => {
    background(
      queries.invalidateQueries({ queryKey: AI_REPAIR_GROUPS_KEY }),
      'ai_repair.groups_refresh_failed',
    );
  };
}

interface DiagnosisRequest {
  readonly fingerprint: string;
  readonly requestId: string;
  readonly authority: AssistantWriteScope;
  readonly current: () => boolean;
}

export interface RepairDiagnosisAction {
  readonly diagnose: () => void;
  readonly pending: boolean;
  readonly failed: boolean;
}

type Attempt = DiagnosisRequest & { readonly status: 'pending' | 'failed' };

function useRepairScreenCurrent(): () => () => boolean {
  const pause = use(ScreenPausedContext);
  const paused = useScreenPaused();
  const active = useRef<() => boolean>(() => false);
  useFocusEffect(
    useCallback(() => {
      let current = !paused && !pause.isPaused();
      active.current = (): boolean => current && !pause.isPaused();
      const stop = pause.subscribe(() => {
        if (pause.isPaused()) current = false;
      });
      return (): void => {
        current = false;
        stop();
      };
    }, [pause, paused]),
  );
  return () => active.current;
}

function requestCurrent(request: DiagnosisRequest): boolean {
  return request.current() && request.authority.current();
}

async function diagnoseRepair(
  request: DiagnosisRequest,
  store: EntityStore,
): Promise<AiRepairAdmission> {
  const { fingerprint, requestId, authority } = request;
  const admission = await authority.client.call(E.diagnoseAiRepairGroup, {
    params: { fingerprint },
    body: { requestId },
  });
  if (admission.kind === 'held' || !requestCurrent(request)) return admission;
  if (store.get().tables.ai_chats.byId[admission.chatId] !== undefined) return admission;
  const chats = await authority.client.call(E.listAiChats, { query: {} });
  if (!requestCurrent(request)) return admission;
  const chat = chats.find((row) => row.id === admission.chatId);
  if (chat === undefined) throw new Error('The AI repair chat could not be loaded. Try again.');
  store.update((state) => {
    if (state.tables.ai_chats.byId[chat.id] !== undefined) return state;
    return {
      ...state,
      tables: { ...state.tables, ai_chats: upsert(state.tables.ai_chats, chat, RULES.ai_chats) },
    };
  });
  return admission;
}

function useDiagnosisMutation(
  attempts: RefObject<Map<string, Attempt>>,
  publish: () => void,
): ReturnType<typeof useMutation<AiRepairAdmission, Error, DiagnosisRequest>> {
  const client = useQueryClient();
  const store = useEntityStore();
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: (request: DiagnosisRequest) => diagnoseRepair(request, store),
    onSuccess: async (admission, request): Promise<void> => {
      await client.invalidateQueries({ queryKey: AI_REPAIR_GROUPS_KEY });
      attempts.current.delete(request.fingerprint);
      publish();
      if (admission.kind !== 'held' && requestCurrent(request)) {
        router.navigate(href.assistantChat(admission.chatId));
      }
    },
    onError: (_error, request): void => {
      attempts.current.set(request.fingerprint, { ...request, status: 'failed' });
      publish();
    },
  });
}

export function useDiagnosisRequests(): (fingerprint: string) => RepairDiagnosisAction {
  const store = useEntityStore();
  const captureCurrent = useRepairScreenCurrent();
  const attempts = useRef(new Map<string, Attempt>());
  const [visible, setVisible] = useState<ReadonlyMap<string, Attempt>>(new Map());
  const publish = (): void => {
    setVisible(new Map(attempts.current));
  };
  const mutation = useDiagnosisMutation(attempts, publish);
  return (fingerprint) => {
    const shown = visible.get(fingerprint);
    return {
      diagnose: (): void => {
        const attempt = attempts.current.get(fingerprint);
        if (attempt?.status === 'pending') return;
        const requestId = attempt?.requestId ?? randomUUID();
        const request = {
          fingerprint,
          requestId,
          authority: captureAssistantWrite(store),
          current: captureCurrent(),
        };
        attempts.current.set(fingerprint, { ...request, status: 'pending' });
        publish();
        mutation.mutate(request);
      },
      pending: shown?.status === 'pending',
      failed: shown?.status === 'failed',
    };
  };
}
