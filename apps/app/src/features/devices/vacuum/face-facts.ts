import type { VacuumScene } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import { parseMapVersion } from './data/map-feed';
import { useRoomLinksSummaryOf, useRoomLinksValue } from './data/room-links-value';
import { useVacuumSceneOf } from './data/scene-query';
import { useVacuum, type Vacuum } from './data/use-vacuum';
import { faultOfText, type VacuumFault } from './data/use-vacuum-fault';
import { jobSummaryOf, type JobSummary } from './model/job-summary';
import { linkNoticeOf, type LinkNotice } from './model/room-links';
import { vacuumChipOf, type VacuumChip } from './model/phase-chip';
import { readingOf, valueOrNull } from './model/readings';

export interface FaceFacts {
  readonly vacuum: Vacuum;
  readonly chip: VacuumChip;
  readonly scene: VacuumScene | null;
  readonly job: JobSummary | null;
  readonly battery: number | null;
  readonly links: LinkNotice | null;
  readonly fault: VacuumFault | null;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function useFaceFacts(device: Device): FaceFacts {
  const vacuum = useVacuum(device);
  const { snapshot } = vacuum;
  const version = readingOf(() => parseMapVersion(snapshot.mapVersionText));
  const linksValue = useRoomLinksValue(device.id);
  const { scene } = useVacuumSceneOf(device.id, valueOrNull(version), linksValue);
  const links = linkNoticeOf(useRoomLinksSummaryOf(device.id, linksValue));
  return {
    vacuum,
    chip: vacuumChipOf(snapshot.values, snapshot.online),
    scene,
    job: valueOrNull(jobSummaryOf(snapshot.values, scene?.rooms ?? [])),
    battery: numberOf(snapshot.values.battery),
    links,
    fault: faultOfText(snapshot.faultText),
  };
}
