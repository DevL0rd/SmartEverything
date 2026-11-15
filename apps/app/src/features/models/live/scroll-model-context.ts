import { createContext } from 'react';
import type { ScrollLayer } from './scroll-model-layer';

export const ScrollModelContext = createContext<ScrollLayer | null>(null);
