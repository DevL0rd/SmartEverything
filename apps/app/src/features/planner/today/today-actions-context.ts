import { createContext } from 'react';
import type { TodayActionsValue } from './today-actions';

export const TodayActionsContext = createContext<TodayActionsValue | null>(null);
