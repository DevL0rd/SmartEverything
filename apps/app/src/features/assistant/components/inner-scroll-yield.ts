import { createContext } from 'react';
import type { YieldTo } from './inner-scroll';

export const InnerScrollYield = createContext<YieldTo | null>(null);
