import { VACUUM_SCENE_ANSWER, type EndpointName } from '@smarteverything/domain';
import { compactVacuumMap } from './vacuum-map-compact';

type OperationView = (result: unknown) => unknown;

const OPERATION_VIEWS: Readonly<Partial<Record<EndpointName, OperationView>>> = {
  getVacuumScene: (result) => compactVacuumMap(VACUUM_SCENE_ANSWER.parse(result)),
};

export function operationView(name: EndpointName, result: unknown): unknown {
  const view = OPERATION_VIEWS[name];
  return view === undefined ? result : view(result);
}
