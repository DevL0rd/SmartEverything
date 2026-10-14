import type { Engine } from '@smarteverything/domain';
import { useHarnessCatalogue } from '../data/harness';
import { useEngineCatalogue } from '../provider/provider-data';
import { isComputerEngine } from '../provider/computer-engine';
import { useModelChoice } from '../picker/model-label';
export function useEngineEfforts(engine: Engine): readonly string[] {
  const model = useModelChoice(engine.kind === 'openrouter' ? engine.model : null);
  const native = useEngineCatalogue();
  const harness = useHarnessCatalogue();
  if (engine.kind === 'dsh') return harnessEfforts(engine, harness.data);
  if (isComputerEngine(engine)) return nativeEfforts(engine, native.data);
  return model?.efforts ?? [];
}

function harnessEfforts(
  engine: Extract<Engine, { kind: 'dsh' }>,
  catalogue: ReturnType<typeof useHarnessCatalogue>['data'],
): readonly string[] {
  const route = catalogue?.routes.find((row) => row.id === engine.model_route_id);
  return route?.models.find((row) => row.id === engine.model)?.capabilities.efforts ?? [];
}
function nativeEfforts(
  engine: Extract<Engine, { kind: 'claude' | 'codex' }>,
  catalogue: ReturnType<typeof useEngineCatalogue>['data'],
): readonly string[] {
  const computer = catalogue?.computers.find(
    (row) => row.runtime === engine.kind && row.device_id === engine.device_id,
  );
  return computer?.models.find((row) => row.id === engine.model)?.efforts ?? [];
}
