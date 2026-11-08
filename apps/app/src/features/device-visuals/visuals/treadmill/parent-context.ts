import { createContext } from 'react';

export const ORIGIN = { x: 0, y: 0 } as const;

export const ParentContext = createContext<{ readonly x: number; readonly y: number }>(ORIGIN);
