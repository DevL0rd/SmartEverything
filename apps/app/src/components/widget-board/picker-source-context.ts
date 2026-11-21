import { createContext } from 'react';
import type { PickerSource } from './picker-source';

export const PickerSourceContext = createContext<PickerSource | null>(null);
