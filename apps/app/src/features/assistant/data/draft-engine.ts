import { useDesktopHarness } from './desktop-harness';
import {
  DEFAULT_AI_HARNESS_PERMISSION,
  type DshEngine,
  type Engine,
} from '@smarteverything/domain';
import { useEngineCatalogue } from '../provider/provider-data';
import { ValueStore, useValue } from '../../../design/external-store';

const NO_ROUTE = '00000000-0000-4000-8000-000000000000';

const PENDING_DEFAULT: DshEngine = {
  kind: 'dsh',
  execution_target: { kind: 'server' },
  session_id: null,
  model_route_id: NO_ROUTE,
  model: 'default',
  effort: null,
  permission: DEFAULT_AI_HARNESS_PERMISSION,
};

const engine = new ValueStore<Engine | null>(null);
const coordinator = new ValueStore<DshEngine | null>(null);
export const draftHostChoice = new ValueStore<string | null>(null);

export function useDraftEngine(
  coordinatorOnly = false,
): readonly [Engine, (next: Engine) => void, boolean] {
  const selected = useValue(engine);
  const retained = useValue(coordinator);
  const explicit = coordinatorOnly ? retained : (selected ?? retained);
  const defaults = useDraftDefaults();
  return [
    explicit ?? defaults.engine,
    coordinatorOnly ? setCoordinatorEngine : setDraftEngine,
    explicit !== null || defaults.ready,
  ];
}

function useDraftDefaults(): { readonly engine: DshEngine; readonly ready: boolean } {
  const catalogue = useEngineCatalogue();
  const local = useDesktopHarness();
  const host = useValue(draftHostChoice);
  return {
    engine: draftDefault(catalogue.data?.default, local),
    ready: (host !== null || local.ready) && catalogue.data !== undefined,
  };
}

function setCoordinatorEngine(next: Engine): void {
  if (next.kind === 'dsh') coordinator.set(next);
}

export function setDraftEngine(next: Engine): void {
  if (next.kind === 'dsh') {
    setCoordinatorEngine(next);
    chooseCoordinator();
  } else engine.set(next);
}

export function draftNativeIsCurrent(value: Engine): boolean {
  return engine.get() === value;
}

export function chooseCoordinator(): void {
  engine.set(null);
}

export function resetDraftEngine(): void {
  chooseCoordinator();
  resetCoordinatorDraft();
}

export function resetCoordinatorDraft(): void {
  coordinator.set(null);
  draftHostChoice.set(null);
}

function draftDefault(
  saved: Engine | undefined,
  local: ReturnType<typeof useDesktopHarness>,
): DshEngine {
  return {
    ...(saved?.kind === 'dsh' ? saved : PENDING_DEFAULT),
    execution_target: local.desktop && local.target !== null ? local.target : { kind: 'server' },
    session_id: null,
  };
}
