import { shellyOperation, type ShellyAction } from '@smarteverything/shelly';
import { useIsOwner } from '../../store/selectors';

export function useCanOperate(): (action: ShellyAction) => boolean {
  const owner = useIsOwner();
  return (action) => owner || !shellyOperation(action).owner;
}
