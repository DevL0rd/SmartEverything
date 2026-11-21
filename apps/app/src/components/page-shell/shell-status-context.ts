import { createContext } from 'react';

export type StatusForm = 'chip' | 'icon';

export const StatusFormContext = createContext<StatusForm>('chip');
