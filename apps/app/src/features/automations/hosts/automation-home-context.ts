import { createContext } from 'react';
import type { HomeData } from './option-types';

export const AutomationHomeContext = createContext<HomeData | null>(null);
