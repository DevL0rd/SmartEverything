import type { EdgeEnd } from '../../model/graph/scene-contract';
import type { GraphPoint } from '../canvas/graph-canvas-types';

export interface HostActions {
  readonly openNode: (id: string) => void;
  readonly dropEmpty: (from: EdgeEnd, point: GraphPoint, screen: GraphPoint) => void;
  readonly insertOnWire: (from: EdgeEnd) => void;
  readonly addTrigger: () => void;
  readonly escape: () => void;
  readonly stepPass: (nodeId: string, delta: -1 | 1) => void;
  readonly groupSelection: (ids: readonly string[]) => void;
}
