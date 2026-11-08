import type { AiRouteInfo, Engine } from '@smarteverything/domain';
import { useRouteInfo } from '../data/route-info';
import { effortSteps, type EffortSteps } from '../model/composer-state';
import { effortLabel } from '../picker/efforts';
import { useEngineCatalogue } from '../provider/provider-data';

export interface EngineEffort {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

export interface EngineThinking {
  readonly efforts: readonly EngineEffort[];
  readonly defaultEffort: string | null;
}

const NO_THINKING: EngineThinking = { efforts: [], defaultEffort: null };

export function routeThinking(info: AiRouteInfo | undefined): EngineThinking {
  const reasoning = info?.reasoning ?? null;
  if (reasoning === null) return NO_THINKING;
  return { efforts: reasoning.efforts, defaultEffort: reasoning.default_effort };
}

export function useEngineThinking(engine: Engine): EngineThinking {
  const native = useEngineCatalogue();
  const route = useRouteInfo(engine);
  if (engine.kind === 'dsh') return routeThinking(route.data);
  return nativeThinking(engine, native.data);
}

export function useEngineEfforts(engine: Engine): readonly string[] {
  return useEngineThinking(engine).efforts.map((effort) => effort.id);
}

function nativeThinking(
  engine: Extract<Engine, { kind: 'claude' | 'codex' }>,
  catalogue: ReturnType<typeof useEngineCatalogue>['data'],
): EngineThinking {
  const computer = catalogue?.computers.find(
    (row) => row.runtime === engine.kind && row.device_id === engine.device_id,
  );
  const efforts = computer?.models.find((row) => row.id === engine.model)?.efforts ?? [];
  return {
    efforts: efforts.map((id) => ({ id, name: effortLabel(id), description: null })),
    defaultEffort: null,
  };
}

function nameOf(thinking: EngineThinking, effort: string): string {
  return thinking.efforts.find((row) => row.id === effort)?.name ?? effortLabel(effort);
}

export function effortName(thinking: EngineThinking, effort: string | null): string | null {
  return effort === null ? null : nameOf(thinking, effort);
}

export function levelSteps(effort: string | null): EffortSteps | null {
  return effort === null ? null : effortSteps(effortLabel(effort));
}

export function appliedEffort(thinking: EngineThinking, effort: string | null): string | null {
  return effort ?? thinking.defaultEffort;
}

export function effortOverride(thinking: EngineThinking, level: string | null): string | null {
  return level === thinking.defaultEffort ? null : level;
}

export function effortText(thinking: EngineThinking, effort: string | null): string | null {
  return effortName(thinking, appliedEffort(thinking, effort));
}

export function chipLabel(name: string, effort: string | null, facts: readonly string[]): string {
  const about = facts.length === 0 ? '' : ` ${facts.join(', ')}.`;
  const chosen = effort === null ? name : `${name}, ${effort}`;
  return `Model and thinking: ${chosen}.${about} Opens the model menu`;
}

export function cycleEffort(
  efforts: readonly string[],
  current: string | null,
  step: 1 | -1,
  wrap: boolean,
): string | null {
  if (efforts.length === 0) return current;
  const found = current === null ? -1 : efforts.indexOf(current);
  if (found === -1) return efforts[step === 1 ? 0 : efforts.length - 1] ?? current;
  const next = wrap
    ? (found + step + efforts.length) % efforts.length
    : Math.min(Math.max(found + step, 0), efforts.length - 1);
  return efforts[next] ?? current;
}
