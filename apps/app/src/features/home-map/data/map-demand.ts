import {
  useMapDemand,
  type MapDemandPorts,
} from '../../../components/house-map/live-demand/use-map-demand';
import { visibilityRegistry } from '../../../components/house-map/live-visibility/registry';
import { acquireTrackingLease } from '../../../plugins/shelly-presence/use-tracking-lease';
import { liveWatch } from '../../../store/live-watch';
import { useDevices } from '../../../store/selectors';
import { VACUUM_MAP_TOPICS } from '../../devices';
import { stageDemand, type StageBoard } from '../components/stage/stage-states';
import {
  boardStagesOf,
  mapDemandFacts,
  type DemandLook,
  type PlacedMap,
} from '../model/map-demand';

const MAP_DEMAND_PORTS: MapDemandPorts = {
  registry: visibilityRegistry,
  holdRoute: (deviceId) => liveWatch.hold(deviceId, VACUUM_MAP_TOPICS),
  acquireTracking: acquireTrackingLease,
};

export function useHomeMapDemand(board: StageBoard, map: PlacedMap | null, look: DemandLook): void {
  const devices = useDevices();
  const facts = mapDemandFacts(map, devices, look);
  const stages = boardStagesOf(board);
  useMapDemand(stageDemand(stages.inline, facts), MAP_DEMAND_PORTS);
  useMapDemand(stageDemand(stages.full, facts), MAP_DEMAND_PORTS);
}
