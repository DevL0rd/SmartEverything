import type { LaundryRole } from '@smarteverything/domain';
import { useControl, type Control } from '../../../store/control';
import type { Laundry } from './use-laundry';

export type ControlRole = LaundryRole | 'power' | 'child_lock' | 'buzzer';

export interface RoleControl {
  readonly key: string | undefined;
  readonly control: Control;
}

export function useRoleControl(laundry: Laundry, role: ControlRole): RoleControl {
  const key = laundry.keyOf(role);
  const control = useControl(laundry.device.id, key ?? '');
  return { key, control };
}
