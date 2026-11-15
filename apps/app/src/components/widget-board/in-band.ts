import { createContext } from 'react';
import type { Band } from './band-context';

export const InBand = createContext<Band | null>(null);
