import { useState } from 'react';

export function useStableValue<T>(value: T, equal: (kept: T, next: T) => boolean): T {
  const [kept, setKept] = useState(value);
  if (kept === value || equal(kept, value)) {
    return kept;
  }
  setKept(value);
  return value;
}
