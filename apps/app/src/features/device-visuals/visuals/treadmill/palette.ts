import { useUniwind } from 'uniwind';

export interface Silver {
  readonly sv1: string;
  readonly sv2: string;
  readonly sv3: string;
  readonly sv4: string;
  readonly sv5: string;
  readonly groove: string;
  readonly acc: string;
  readonly grip: string;
  readonly belt: string;
  readonly edge: string;
  readonly glass1: string;
  readonly glass2: string;
  readonly rim: string;
  readonly lcd: string;
  readonly seam: string;
  readonly grain: string;
}

export const SILVER: Readonly<Record<'light' | 'dark', Silver>> = {
  dark: {
    sv1: '#d4d9e0',
    sv2: '#9ba2ae',
    sv3: '#6e7581',
    sv4: '#454b55',
    sv5: '#2a2e36',
    groove: '#0d0f13',
    acc: '#e2a93e',
    grip: '#15181d',
    belt: '#0b0d10',
    edge: 'rgba(255,255,255,.34)',
    glass1: '#2b313b',
    glass2: '#06080b',
    rim: 'rgba(255,255,255,.55)',
    lcd: '#8ff0c0',
    seam: 'rgba(255,255,255,.5)',
    grain: 'rgba(255,255,255,.2)',
  },
  light: {
    sv1: '#e6e9ee',
    sv2: '#b0b6c0',
    sv3: '#7d8490',
    sv4: '#565d69',
    sv5: '#353a43',
    groove: '#2b2f37',
    acc: '#d89a2b',
    grip: '#262a31',
    belt: '#1d2127',
    edge: 'rgba(255,255,255,.4)',
    glass1: '#3b414b',
    glass2: '#12151a',
    rim: 'rgba(255,255,255,.85)',
    lcd: '#a7ffd0',
    seam: 'rgba(255,255,255,.55)',
    grain: 'rgba(255,255,255,.22)',
  },
};

export const WALKER = {
  skin: '#dba67c',
  skinDark: '#b98259',
  shorts: '#333945',
  shortsDark: '#242932',
  shoe: '#e7ebf1',
  sole: '#e2a93e',
  hair: '#2a211d',
} as const;

export function useSilver(): Silver {
  return useUniwind().theme === 'light' ? SILVER.light : SILVER.dark;
}
