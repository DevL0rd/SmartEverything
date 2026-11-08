import { createHash } from 'node:crypto';
import {
  AI_DEFAULT_MODEL,
  AI_EFFORTS,
  ApiError,
  AUTO_LATEST_GEMINI_FLASH,
  DEFAULT_AI_EFFORT,
  DEFAULT_AI_HARNESS_PERMISSION,
  closestEffort,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type {
  AiEffort,
  AiModelRow,
  DshEngine,
  Engine,
  EngineRequest,
} from '@smarteverything/domain';

export function meteredRouteId(profileId: string): string {
  const digest = createHash('sha256').update(`harness-openrouter:${profileId}`).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export interface MeteredChoice {
  readonly model: string | null;
  readonly effort: string | null;
}

export interface MeteredCatalogue {
  readonly row: (id: string) => Pick<AiModelRow, 'reasoning' | 'efforts'> | undefined;
}

export function meteredCatalogue(store: {
  readonly aiModels: Pick<Store['aiModels'], 'row'>;
}): MeteredCatalogue {
  return { row: (id) => store.aiModels.row(id) };
}

export function defaultEngine(
  store: Pick<Store, 'aiModels' | 'aiEngineDefaults'>,
  profileId: string,
): Engine {
  const stored = store.aiEngineDefaults.read();
  const engine =
    stored ?? meteredEngine(profileId, { model: null, effort: null }, meteredCatalogue(store));
  return engine.kind === 'dsh'
    ? { ...engine, session_id: null, execution_target: { kind: 'server' } }
    : engine;
}

export function completeEngine(
  profileId: string,
  request: EngineRequest,
  catalogue: MeteredCatalogue,
): Engine {
  if (request.kind !== 'dsh') return request;
  const { model_route_id: route, model } = request;
  if (route !== null) {
    if (model === null)
      throw new ApiError('invalid_request', 'Name the model that runs on the chosen route.');
    return { ...request, model_route_id: route, model };
  }
  const metered = meteredEngine(profileId, { model, effort: request.effort }, catalogue);
  return {
    ...metered,
    execution_target: request.execution_target,
    session_id: request.session_id,
    permission: request.permission,
  };
}

export function meteredEngine(
  profileId: string,
  choice: MeteredChoice,
  catalogue: MeteredCatalogue,
): DshEngine {
  const wanted = choice.model ?? AI_DEFAULT_MODEL;
  const model = wanted === AUTO_LATEST_GEMINI_FLASH ? AI_DEFAULT_MODEL : wanted;
  const effort = choice.effort ?? (choice.model === null ? DEFAULT_AI_EFFORT : null);
  return {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model_route_id: meteredRouteId(profileId),
    model,
    effort: effort === null ? null : effortOf(catalogue.row(model), effort),
    permission: DEFAULT_AI_HARNESS_PERMISSION,
  };
}

function effortOf(
  row: Pick<AiModelRow, 'reasoning' | 'efforts'> | undefined,
  wanted: string,
): string | null {
  if (row === undefined) return wanted;
  if (row.reasoning === 'none') return null;
  return closestEffort(row, isEffort(wanted) ? wanted : DEFAULT_AI_EFFORT);
}

function isEffort(value: string): value is AiEffort {
  return AI_EFFORTS.some((effort) => effort === value);
}
