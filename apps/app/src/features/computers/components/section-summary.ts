import { useComputerSelect } from '../data/computer-metrics';
import { railSummaryOf } from '../model/computer-view';

export function useSectionSummary(
  deviceId: string,
  id: string,
  online: boolean,
  missing: string | null,
): string | null {
  const live = useComputerSelect(deviceId, (parts) => railSummaryOf(id, parts));
  return missing ?? (online ? live : 'Offline');
}
