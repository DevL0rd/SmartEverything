import { StoreNotFoundError } from '../store/context';

export function unlessGone<T>(read: () => T): T | null {
  try {
    return read();
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) {
      return null;
    }
    throw cause;
  }
}
