import { isLocalScale } from '../../store/people';
import { useDevices } from '../../store/selectors';

export function useHasScale(): boolean {
  return useDevices({ includeHidden: true }).some(isLocalScale);
}
