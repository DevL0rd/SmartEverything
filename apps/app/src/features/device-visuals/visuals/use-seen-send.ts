import { useState } from 'react';

export function useSeenSend(at: string | null, playing: boolean): string | null {
  const [seen, setSeen] = useState(at);
  if (!playing && seen !== at) {
    setSeen(at);
  }
  return seen;
}
