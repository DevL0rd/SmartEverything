import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { applianceOf, offlineCause } from '../appliance/appliance-model';

const NOT_RESPONDING_HINT = 'Check that it’s plugged in and on Wi‑Fi.';

export function useOfflineHint(device: Device): string {
  const appliance = applianceOf(device);
  const blaster = useRow('devices', appliance === null ? null : appliance.blasterId);
  return appliance === null ? NOT_RESPONDING_HINT : offlineCause(appliance, blaster);
}
