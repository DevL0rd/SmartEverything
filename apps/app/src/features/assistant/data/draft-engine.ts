import { useDesktopHarness } from './desktop-harness';
import { DEFAULT_ENGINE, type Engine } from '@smarteverything/domain';
import { useComputerProviderSupported, useEngineCatalogue } from '../provider/provider-data';
import { ValueStore, useValue } from '../../../design/external-store';

const engine = new ValueStore<Engine | null>(null);
export const draftHostChoice = new ValueStore<string | null>(null);

export function useDraftEngine(): readonly [Engine, (next: Engine) => void, boolean] {
  const explicit = useValue(engine);
  const catalogue = useEngineCatalogue();
  const supported = useComputerProviderSupported();
  const local = useDesktopHarness();
  const host = useValue(draftHostChoice);
  const saved = catalogue.data?.default ?? DEFAULT_ENGINE;
  const defaultReady = saved.kind !== 'dsh' || host !== null || local.ready;
  return [
    explicit ?? draftDefault(saved, local),
    engine.set,
    explicit !== null || (defaultReady && (!supported || catalogue.data !== undefined)),
  ];
}

export function resetDraftEngine(): void {
  engine.set(null);
  draftHostChoice.set(null);
}

function draftDefault(saved: Engine, local: ReturnType<typeof useDesktopHarness>): Engine {
  return saved.kind === 'dsh'
    ? {
        ...saved,
        execution_target:
          local.desktop && local.target !== null ? local.target : { kind: 'server' },
        session_id: null,
      }
    : saved;
}
