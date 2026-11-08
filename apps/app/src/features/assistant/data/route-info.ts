import { skipToken, type UseQueryResult } from '@tanstack/react-query';
import { AI_HARNESS_ENDPOINTS as E, type AiRouteInfo, type Engine } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { contextText } from './cost';

export interface RouteChoice {
  readonly route_id: string;
  readonly model: string;
}

export function routeChoiceOf(engine: Engine): RouteChoice | null {
  return engine.kind === 'dsh' ? { route_id: engine.model_route_id, model: engine.model } : null;
}

export function routeInfoKey(choice: RouteChoice | null): readonly unknown[] {
  return ['ai-route-info', choice?.route_id ?? null, choice?.model ?? null];
}

export function useRouteInfo(engine: Engine): UseQueryResult<AiRouteInfo> {
  const choice = routeChoiceOf(engine);
  return useScreenQuery({
    queryKey: routeInfoKey(choice),
    queryFn:
      choice === null
        ? skipToken
        : (): Promise<AiRouteInfo> => api().call(E.readAiRouteInfo, { query: choice }),
  });
}

function outputText(tokens: number | null): string | null {
  if (tokens === null) return null;
  const size = tokens < 1000 ? String(tokens) : `${String(Math.round(tokens / 1000))}K`;
  return `${size} output tokens`;
}

export function routeFacts(info: AiRouteInfo | undefined): readonly string[] {
  if (info === undefined) return [];
  const facts = [
    contextText(info.context_window),
    outputText(info.default_max_tokens),
    info.input_modalities?.includes('image') === true ? 'reads images' : null,
  ];
  return facts.filter((fact) => fact !== null);
}
