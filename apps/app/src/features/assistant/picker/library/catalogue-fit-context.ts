import { createContext } from 'react';
import type { Measure } from './catalogue-fit';

export const CatalogueFit = createContext<Measure | null>(null);
