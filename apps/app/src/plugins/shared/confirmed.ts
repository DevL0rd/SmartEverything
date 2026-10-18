import { confirm, type ConfirmRequest } from '../../components/confirm-store';

export function confirmed(confirmation: ConfirmRequest | undefined): Promise<boolean> {
  return confirmation === undefined ? Promise.resolve(true) : confirm(confirmation);
}
