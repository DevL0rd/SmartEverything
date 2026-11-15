import { createContext } from 'react';
import type { SheetNavigation } from './sheet-navigation';

export const SheetNavigationContext = createContext<SheetNavigation | null>(null);
