import { createContext, use, useState } from 'react';

export interface SectionSearch {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export const SectionSearchContext = createContext<SectionSearch | null>(null);

export function useSectionSearch(): SectionSearch {
  const search = use(SectionSearchContext);
  if (search === null) {
    throw new Error('useSectionSearch needs a section that declares a search');
  }
  return search;
}

export function useSectionSearchState(seed: string, initial: string): SectionSearch {
  const [state, setState] = useState({ seed, value: initial });
  return {
    value: state.seed === seed ? state.value : initial,
    onChange: (value): void => {
      setState({ seed, value });
    },
  };
}
