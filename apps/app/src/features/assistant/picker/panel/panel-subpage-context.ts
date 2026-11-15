import { createContext } from 'react';
import type { PanelSubpage } from './panel-subpage';

export const PanelSubpageContext = createContext<PanelSubpage | null>(null);
