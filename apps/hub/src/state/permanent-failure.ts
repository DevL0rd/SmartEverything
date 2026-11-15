import { StoreConflictError } from '../store/sql';

export function refusedByStore(cause: unknown): boolean {
  return cause instanceof StoreConflictError;
}
