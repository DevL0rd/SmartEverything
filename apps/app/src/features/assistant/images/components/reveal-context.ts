import { createContext } from 'react';
import type { ImageReveal } from './image-result-context';

export const RevealContext = createContext<ImageReveal | null>(null);
