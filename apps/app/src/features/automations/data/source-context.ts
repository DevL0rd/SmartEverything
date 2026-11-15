import { createContext } from 'react';
import type { AutomationsSource } from './source';

export const AutomationsSourceContext = createContext<AutomationsSource | null>(null);
