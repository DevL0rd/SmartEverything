import { createContext } from 'react';
import type { ThemeName } from './tokens';

export const ScopedThemeName = createContext<ThemeName | null>(null);
