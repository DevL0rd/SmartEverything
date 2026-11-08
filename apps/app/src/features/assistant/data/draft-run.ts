import type { Engine } from '@smarteverything/domain';
import { harnessHostName } from '../model/harness-context';
import { isComputerEngine } from '../provider/computer-engine';
import { useEngineCatalogue } from '../provider/provider-data';
import { useHarnessCatalogue } from './harness';
import { nativeComputer } from './draft-native';
import type { EngineComputer } from '../provider/engine-catalogue';
import { useDevice } from '../../../store/selectors';

const HOME_HUB = 'Home Hub';

export interface DraftRun {
  readonly host: string;
}

export function useDraftRun(engine: Engine): DraftRun {
  const harness = useHarnessCatalogue().data;
  const computers = useEngineCatalogue().data?.computers;
  const nativeHost = useNativeHost(engine, computers);
  if (isComputerEngine(engine)) return { host: nativeHost };
  const target = engine.execution_target;
  return {
    host: target.kind === 'server' ? HOME_HUB : harnessHostName(target, harness),
  };
}

function useNativeHost(engine: Engine, computers: readonly EngineComputer[] | undefined): string {
  const device = useDevice(isComputerEngine(engine) ? engine.device_id : '');
  if (!isComputerEngine(engine)) return 'Selected computer';
  return (
    nativeComputer(computers, engine.kind, engine.device_id)?.name ??
    device?.name ??
    'Selected computer'
  );
}
