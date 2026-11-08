import { createContext } from 'react';
import type { WidgetModels } from './model-frame';

export const WidgetModelsContext = createContext<WidgetModels | null>(null);
