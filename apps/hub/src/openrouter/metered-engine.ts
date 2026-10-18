import { createHash } from 'node:crypto';
import {
  AI_EFFORTS,
  AUTO_LATEST_GEMINI_FLASH,
  DEFAULT_AI_HARNESS_PERMISSION,
  OPENROUTER_DEFAULTS,
  closestEffort,
} from '@smarteverything/domain';
import type { AiEffort, AiModelRow, DshEngine, OpenRouterSettings } from '@smarteverything/domain';

export function meteredRouteId(profileId: string): string {
  const digest = createHash('sha256').update(`harness-openrouter:${profileId}`).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export interface MeteredChoice {
  readonly model: string | null;
  readonly effort: string | null;
}

export interface MeteredCatalogue {
  readonly defaults: Pick<OpenRouterSettings, 'default_model' | 'default_effort'>;
  readonly row: (id: string) => Pick<AiModelRow, 'reasoning' | 'efforts'> | undefined;
}

export function meteredEngine(
  profileId: string,
  choice: MeteredChoice,
  catalogue: MeteredCatalogue,
): DshEngine {
  const wanted = choice.model ?? catalogue.defaults.default_model;
  const model = wanted === AUTO_LATEST_GEMINI_FLASH ? OPENROUTER_DEFAULTS.default_model : wanted;
  return {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model_route_id: meteredRouteId(profileId),
    model,
    effort: effortOf(catalogue.row(model), choice.effort ?? catalogue.defaults.default_effort),
    permission: DEFAULT_AI_HARNESS_PERMISSION,
  };
}

function effortOf(
  row: Pick<AiModelRow, 'reasoning' | 'efforts'> | undefined,
  wanted: string,
): string | null {
  if (row === undefined) return wanted;
  if (row.reasoning === 'none') return null;
  return closestEffort(row, isEffort(wanted) ? wanted : OPENROUTER_DEFAULTS.default_effort);
}

function isEffort(value: string): value is AiEffort {
  return AI_EFFORTS.some((effort) => effort === value);
}
