import { useState } from 'react';

export interface LibraryDisclosure {
  readonly query: string | null;
  readonly open: (query?: string) => void;
  readonly close: () => void;
}

export function useLibraryDisclosure(): LibraryDisclosure {
  const [query, setQuery] = useState<string | null>(null);
  return {
    query,
    open: (text = ''): void => {
      setQuery(text);
    },
    close: (): void => {
      setQuery(null);
    },
  };
}
