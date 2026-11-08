import { createContext } from 'react';

export const HeroInspectContext = createContext<((inspecting: boolean) => void) | null>(null);
