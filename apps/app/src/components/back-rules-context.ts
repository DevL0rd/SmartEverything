import { createContext } from 'react';
import type { BackRules } from './back-navigation';

export const BackRulesContext = createContext<BackRules | null>(null);
