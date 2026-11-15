import { createContext } from 'react';
import type { HeaderPin } from './header-pin';

export const HeaderPinContext = createContext<HeaderPin | null>(null);
