import { useState } from 'react';

export function useClearOnChange(key: string, clear: () => void): void {
  const [seen, setSeen] = useState(key);
  if (seen === key) return;
  setSeen(key);
  clear();
}
